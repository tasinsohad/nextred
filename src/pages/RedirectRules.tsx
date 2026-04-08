import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCloudflareAccounts } from "@/hooks/useCloudflareAccounts";
import { Loader2, CheckCircle2, XCircle, Plus, Trash2, Eye, Rocket, AlertTriangle, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RedirectEntry {
  id: string;
  sourceHostname: string;
  destinationUrl: string;
  redirectType: "301" | "302";
}

interface RuleGroup {
  destinationUrl: string;
  redirectType: "301" | "302";
  sources: string[];
  expression: string;
}

interface DeployStatus {
  phase: "idle" | "dns" | "rules" | "done";
  dnsResults: Record<string, { ok: boolean; msg: string }>;
  ruleResults: Record<string, { ok: boolean; msg: string }>;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cfProxy(params: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", { body: params });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

function extractRootDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

let idCounter = 0;
function nextId() { return `entry-${++idCounter}`; }

const FREE_PLAN_RULE_LIMIT = 10;

// ─── Component ────────────────────────────────────────────────────────────────

export default function RedirectRules() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { accounts } = useCloudflareAccounts();

  // Account selection
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [manualToken, setManualToken] = useState("");
  const [tokenValid, setTokenValid] = useState(false);
  const [validating, setValidating] = useState(false);

  // Entries
  const [entries, setEntries] = useState<RedirectEntry[]>([
    { id: nextId(), sourceHostname: "", destinationUrl: "", redirectType: "301" },
  ]);

  // Bulk paste
  const [bulkText, setBulkText] = useState("");
  const [showBulkPaste, setShowBulkPaste] = useState(false);

  // Preview & deploy
  const [showPreview, setShowPreview] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<DeployStatus>({ phase: "idle", dnsResults: {}, ruleResults: {} });

  // ─── Resolve API token ─────────────────────────────────────────────────

  const getApiToken = useCallback((): string => {
    if (manualToken.trim()) return manualToken.trim().replace(/^Bearer\s+/i, "").trim();
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (account) return atob(account.api_key_encrypted);
    return "";
  }, [manualToken, selectedAccountId, accounts]);

  // ─── Validate token ────────────────────────────────────────────────────

  const handleValidateToken = useCallback(async () => {
    const token = getApiToken();
    if (!token) { toast({ title: "No API token", variant: "destructive" }); return; }
    setValidating(true);
    try {
      const res = await cfProxy({ action: "verify-token", apiToken: token });
      if (!(res as any).success) throw new Error((res as any).detail || "Invalid token");
      setTokenValid(true);
      toast({ title: "Token verified" });
    } catch (err: any) {
      toast({ title: "Token error", description: err.message, variant: "destructive" });
    } finally { setValidating(false); }
  }, [getApiToken, toast]);

  // ─── Entry management ──────────────────────────────────────────────────

  const addEntry = () => setEntries((prev) => [...prev, { id: nextId(), sourceHostname: "", destinationUrl: "", redirectType: "301" }]);

  const removeEntry = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  const updateEntry = (id: string, field: keyof RedirectEntry, value: string) => {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
  };

  // ─── Bulk paste ─────────────────────────────────────────────────────────

  const handleBulkPaste = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    const newEntries: RedirectEntry[] = lines.map((line) => {
      const parts = line.includes(",") ? line.split(",").map((p) => p.trim()) : line.split(/\s+/);
      const source = (parts[0] || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
      const dest = parts[1] || "";
      const type = parts[2] === "302" ? "302" : "301";
      return { id: nextId(), sourceHostname: source, destinationUrl: dest, redirectType: type as "301" | "302" };
    }).filter((e) => e.sourceHostname && e.destinationUrl);

    if (newEntries.length === 0) {
      toast({ title: "No valid entries found", variant: "destructive" });
      return;
    }
    setEntries((prev) => [...prev.filter((e) => e.sourceHostname), ...newEntries]);
    setBulkText("");
    setShowBulkPaste(false);
    toast({ title: `${newEntries.length} entries added` });
  };

  // ─── Grouping logic ────────────────────────────────────────────────────

  const validEntries = useMemo(() => entries.filter((e) => e.sourceHostname && e.destinationUrl), [entries]);

  const ruleGroups = useMemo((): RuleGroup[] => {
    const groups = new Map<string, RuleGroup>();
    for (const entry of validEntries) {
      const key = `${entry.destinationUrl}|${entry.redirectType}`;
      if (!groups.has(key)) {
        groups.set(key, { destinationUrl: entry.destinationUrl, redirectType: entry.redirectType, sources: [], expression: "" });
      }
      const g = groups.get(key)!;
      if (!g.sources.includes(entry.sourceHostname)) g.sources.push(entry.sourceHostname);
    }
    for (const g of groups.values()) {
      g.expression = g.sources.map((s) => `(http.host eq "${s}")`).join(" or ");
    }
    return Array.from(groups.values());
  }, [validEntries]);

  const exceedsLimit = ruleGroups.length > FREE_PLAN_RULE_LIMIT;

  // ─── Deploy ─────────────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    const apiToken = getApiToken();
    if (!apiToken) { toast({ title: "No API token", variant: "destructive" }); return; }
    if (ruleGroups.length === 0) { toast({ title: "No rules to deploy", variant: "destructive" }); return; }

    setDeploying(true);
    const status: DeployStatus = { phase: "dns", dnsResults: {}, ruleResults: {} };
    setDeployStatus(status);

    const allSources = Array.from(new Set(validEntries.map((e) => e.sourceHostname)));
    const domainGroups = new Map<string, string[]>();
    for (const src of allSources) {
      const root = extractRootDomain(src);
      if (!domainGroups.has(root)) domainGroups.set(root, []);
      domainGroups.get(root)!.push(src);
    }

    const zoneMap = new Map<string, string>();
    for (const domain of domainGroups.keys()) {
      try {
        const res = await cfProxy({ action: "search-zones", apiToken, data: { domainName: domain } });
        const zones = (res as any).zones as any[];
        if (zones?.length > 0) zoneMap.set(domain, zones[0].id);
        else {
          status.dnsResults[domain] = { ok: false, msg: `Zone not found for ${domain}` };
          setDeployStatus({ ...status });
        }
      } catch (err: any) {
        status.dnsResults[domain] = { ok: false, msg: err.message };
        setDeployStatus({ ...status });
      }
    }

    for (const [domain, hostnames] of domainGroups) {
      const zoneId = zoneMap.get(domain);
      if (!zoneId) continue;

      let existingRecords: any[] = [];
      try {
        const dnsRes = await cfProxy({ action: "get-dns-records", apiToken, zoneId });
        existingRecords = ((dnsRes as any).records ?? []) as any[];
      } catch { /* continue */ }

      for (const hostname of hostnames) {
        try {
          const existing = existingRecords.find((r: any) => r.type === "A" && r.name === hostname);
          if (existing && existing.proxied && existing.content === "192.0.2.1") {
            status.dnsResults[hostname] = { ok: true, msg: "A record exists" };
          } else if (existing) {
            await cfProxy({
              action: "update-dns-record", apiToken, zoneId,
              data: { id: existing.id, type: "A", name: hostname, content: "192.0.2.1", proxied: true, ttl: 1 },
            });
            status.dnsResults[hostname] = { ok: true, msg: "A record updated" };
          } else {
            await cfProxy({
              action: "create-dns-record", apiToken, zoneId,
              data: { type: "A", name: hostname, content: "192.0.2.1", proxied: true, ttl: 1 },
            });
            status.dnsResults[hostname] = { ok: true, msg: "A record created" };
          }
        } catch (err: any) {
          status.dnsResults[hostname] = { ok: false, msg: err.message };
        }
        setDeployStatus({ ...status });
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    status.phase = "rules";
    setDeployStatus({ ...status });

    const rulesByZone = new Map<string, { zoneId: string; rules: any[] }>();
    for (const group of ruleGroups) {
      const rootDomains = new Set(group.sources.map(extractRootDomain));
      for (const rootDomain of rootDomains) {
        const zoneId = zoneMap.get(rootDomain);
        if (!zoneId) continue;

        const zoneSources = group.sources.filter((s) => extractRootDomain(s) === rootDomain);
        const expression = zoneSources.map((s) => `(http.host eq "${s}")`).join(" or ");

        if (!rulesByZone.has(zoneId)) rulesByZone.set(zoneId, { zoneId, rules: [] });
        rulesByZone.get(zoneId)!.rules.push({
          expression,
          description: `Redirect to ${group.destinationUrl}`,
          action: "redirect",
          action_parameters: {
            from_value: {
              status_code: parseInt(group.redirectType, 10),
              target_url: { value: group.destinationUrl },
              preserve_query_string: true,
            },
          },
        });
      }
    }

    for (const [zoneId, { rules }] of rulesByZone) {
      const zoneLabel = Array.from(zoneMap.entries()).find(([, id]) => id === zoneId)?.[0] || zoneId;
      try {
        let existingRules: any[] = [];
        try {
          const existingRes = await cfProxy({ action: "get-redirect-ruleset", apiToken, zoneId });
          if ((existingRes as any).success && (existingRes as any).ruleset?.rules) {
            existingRules = (existingRes as any).ruleset.rules.filter(
              (r: any) => !r.description?.startsWith("Redirect to ")
            );
          }
        } catch { /* no existing ruleset */ }

        const allRules = [...existingRules, ...rules];
        const res = await cfProxy({ action: "deploy-redirect-ruleset", apiToken, zoneId, data: { rules: allRules } });

        if ((res as any).success) {
          status.ruleResults[zoneLabel] = { ok: true, msg: `${rules.length} rule(s) deployed` };
        } else {
          const errMsg = (res as any).errors?.[0]?.message || "Deploy failed";
          status.ruleResults[zoneLabel] = { ok: false, msg: errMsg };
        }
      } catch (err: any) {
        status.ruleResults[zoneLabel] = { ok: false, msg: err.message };
      }
      setDeployStatus({ ...status });
    }

    if (user) {
      for (const entry of validEntries) {
        try {
          await supabase.from("redirect_history").upsert({
            user_id: user.id,
            source_url: entry.sourceHostname,
            destination_url: entry.destinationUrl,
            domain: extractRootDomain(entry.sourceHostname),
            subdomain: entry.sourceHostname.split(".").length > 2 ? entry.sourceHostname.split(".").slice(0, -2).join(".") : null,
            redirect_type: "redirect_rule",
            status_code: parseInt(entry.redirectType, 10),
            status: "active",
            zone_id: zoneMap.get(extractRootDomain(entry.sourceHostname)) || null,
          }, { onConflict: "source_url,user_id" as any });
        } catch { /* best effort */ }
      }
    }

    status.phase = "done";
    setDeployStatus({ ...status });
    setDeploying(false);
    toast({ title: "Deployment complete" });
  }, [getApiToken, ruleGroups, validEntries, user, toast]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Bulk Redirect Rules</h2>
        <p className="text-muted-foreground">
          Create Cloudflare Redirect Rules grouped by destination. Supports apex domains and subdomains.
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Cloudflare Credentials
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {accounts.length > 0 && (
            <div>
              <label className="text-sm font-medium mb-1 block">Saved Account</label>
              <Select value={selectedAccountId} onValueChange={(v) => { setSelectedAccountId(v); setManualToken(""); setTokenValid(false); }}>
                <SelectTrigger><SelectValue placeholder="Select an account..." /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">Or enter API Token</label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Cloudflare API Token"
                value={manualToken}
                onChange={(e) => { setManualToken(e.target.value); setSelectedAccountId(""); setTokenValid(false); }}
                className="flex-1"
              />
              <Button onClick={handleValidateToken} disabled={validating || tokenValid} size="sm">
                {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {tokenValid ? "Verified ✓" : "Verify"}
              </Button>
            </div>
          </div>
          {(selectedAccountId || tokenValid) && (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
            </Badge>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Redirect Entries</CardTitle>
              <CardDescription>
                Add source hostnames and their destination URLs. Entries with the same destination and redirect type will be grouped into one rule.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowBulkPaste(!showBulkPaste)}>
                Bulk Paste
              </Button>
              <Button variant="outline" size="sm" onClick={addEntry}>
                <Plus className="h-4 w-4 mr-1" /> Add Row
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showBulkPaste && (
            <div className="mb-4 p-4 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground mb-2">
                Paste entries, one per line: <code className="text-xs">source.com destination.com 301</code> (space or comma separated)
              </p>
              <textarea
                className="w-full h-32 p-2 font-mono text-sm border rounded bg-background"
                placeholder={`ops.example.com https://newsite.com 301\nmail.example.com https://newsite.com 301\nexample.org https://other.com 302`}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
              />
              <Button size="sm" className="mt-2" onClick={handleBulkPaste}>Import</Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Source Hostname</span>
              <span>Destination URL</span>
              <span>Type</span>
              <span></span>
            </div>
            {entries.map((entry) => (
              <div key={entry.id} className="grid grid-cols-[1fr_1fr_100px_40px] gap-2 items-center">
                <Input
                  placeholder="sub.example.com or example.com"
                  value={entry.sourceHostname}
                  onChange={(e) => updateEntry(entry.id, "sourceHostname", e.target.value.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))}
                  className="font-mono text-sm"
                />
                <Input
                  placeholder="https://destination.com"
                  value={entry.destinationUrl}
                  onChange={(e) => updateEntry(entry.id, "destinationUrl", e.target.value)}
                  className="text-sm"
                />
                <Select value={entry.redirectType} onValueChange={(v) => updateEntry(entry.id, "redirectType", v)}>
                  <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="301">301</SelectItem>
                    <SelectItem value="302">302</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" onClick={() => removeEntry(entry.id)} className="h-8 w-8">
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Button onClick={() => setShowPreview(true)} disabled={validEntries.length === 0} variant="outline">
              <Eye className="h-4 w-4 mr-2" /> Preview Rules ({ruleGroups.length})
            </Button>
          </div>
        </CardContent>
      </Card>

      {showPreview && ruleGroups.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Rule Preview</CardTitle>
            <CardDescription>
              {ruleGroups.length} rule(s) will be created.
              {exceedsLimit && (
                <span className="text-destructive font-medium ml-2">
                  ⚠ Exceeds Free plan limit of {FREE_PLAN_RULE_LIMIT} rules!
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {ruleGroups.map((group, i) => (
              <div key={i} className="p-4 border rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Badge variant="secondary">Rule {i + 1}</Badge>
                  <Badge variant="outline">{group.redirectType}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-primary font-mono text-xs">{group.destinationUrl}</span>
                </div>
                <div className="text-xs text-muted-foreground">{group.sources.length} source(s)</div>
                <pre className="bg-background border rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {group.sources.map((s) => `(http.host eq "${s}")`).join("\n  or ")}
                </pre>
              </div>
            ))}

            {exceedsLimit && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded">
                <AlertTriangle className="h-4 w-4" />
                You have {ruleGroups.length} rule groups but the Free plan only allows {FREE_PLAN_RULE_LIMIT}. Consider consolidating destinations.
              </div>
            )}

            <Button onClick={handleDeploy} disabled={deploying || !getApiToken()} className="w-full">
              {deploying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              Deploy All Rules
            </Button>
          </CardContent>
        </Card>
      )}

      {deployStatus.phase !== "idle" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Deployment Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.keys(deployStatus.dnsResults).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">DNS Records</h4>
                <div className="space-y-1">
                  {Object.entries(deployStatus.dnsResults).map(([hostname, r]) => (
                    <div key={hostname} className="flex items-center gap-2 text-sm">
                      {r.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <span className="font-mono text-xs">{hostname}</span>
                      <span className="text-muted-foreground text-xs">— {r.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(deployStatus.ruleResults).length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Redirect Rules</h4>
                <div className="space-y-1">
                  {Object.entries(deployStatus.ruleResults).map(([zone, r]) => (
                    <div key={zone} className="flex items-center gap-2 text-sm">
                      {r.ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
                      <span className="font-mono text-xs">{zone}</span>
                      <span className="text-muted-foreground text-xs">— {r.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {deployStatus.phase === "dns" && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating DNS records...</div>}
            {deployStatus.phase === "rules" && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Deploying redirect rules...</div>}
            {deployStatus.phase === "done" && <Badge className="bg-green-600">Deployment Complete</Badge>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

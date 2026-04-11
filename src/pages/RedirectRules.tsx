import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useCloudflareAccounts } from "@/hooks/useCloudflareAccounts";
import { Loader2, CheckCircle2, XCircle, Eye, Rocket, AlertTriangle, Globe } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

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

const FREE_PLAN_RULE_LIMIT = 10;

// ─── Component ────────────────────────────────────────────────────────────────

export default function RedirectRules() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { accounts } = useCloudflareAccounts();

  // Credentials
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [tokenValid, setTokenValid] = useState(false);
  const [validating, setValidating] = useState(false);

  // Input
  const [hostnamesText, setHostnamesText] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [redirectType, setRedirectType] = useState<"301" | "302">("301");

  // Preview & deploy
  const [showPreview, setShowPreview] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<{
    phase: "idle" | "dns" | "rules" | "done";
    dnsResults: Record<string, { ok: boolean; msg: string }>;
    ruleResults: Record<string, { ok: boolean; msg: string }>;
  }>({ phase: "idle", dnsResults: {}, ruleResults: {} });

  // ─── Resolve API token ─────────────────────────────────────────────────

  const getApiToken = useCallback((): string => {
    if (manualToken.trim()) return manualToken.trim().replace(/^Bearer\s+/i, "").trim();
    const account = accounts.find((a) => a.id === selectedAccountId);
    if (account) return atob(account.api_key_encrypted);
    return "";
  }, [manualToken, selectedAccountId, accounts]);

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

  // ─── Parse hostnames ───────────────────────────────────────────────────

  const parsedHostnames = useMemo(() => {
    return hostnamesText
      .split("\n")
      .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((h) => h.length > 0 && h.includes("."));
  }, [hostnamesText]);

  const uniqueHostnames = useMemo(() => Array.from(new Set(parsedHostnames)), [parsedHostnames]);

  // ─── Group by root domain for preview ──────────────────────────────────

  const domainGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const h of uniqueHostnames) {
      const root = extractRootDomain(h);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(h);
    }
    return groups;
  }, [uniqueHostnames]);

  // The expression that will be used (one rule per zone, all grouped)
  const previewExpression = useMemo(() => {
    return uniqueHostnames.map((h) => `(http.host eq "${h}")`).join("\n  or ");
  }, [uniqueHostnames]);

  const isReady = uniqueHostnames.length > 0 && destinationUrl.trim().length > 0;
  // One rule per zone — check if number of zones exceeds limit
  const zoneCount = domainGroups.size;
  const exceedsLimit = zoneCount > FREE_PLAN_RULE_LIMIT;

  // ─── Deploy ─────────────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    const apiToken = getApiToken();
    if (!apiToken) { toast({ title: "No API token", variant: "destructive" }); return; }
    if (!isReady) { toast({ title: "Enter hostnames and destination", variant: "destructive" }); return; }

    setDeploying(true);
    const status = { phase: "dns" as const, dnsResults: {} as Record<string, { ok: boolean; msg: string }>, ruleResults: {} as Record<string, { ok: boolean; msg: string }> };
    setDeployStatus(status);

    const dest = destinationUrl.trim();
    const statusCode = parseInt(redirectType, 10);

    // Resolve zone IDs
    const zoneMap = new Map<string, string>();
    for (const domain of domainGroups.keys()) {
      try {
        const res = await cfProxy({ action: "search-zones", apiToken, data: { domainName: domain } });
        const zones = (res as any).zones as any[];
        if (zones?.length > 0) {
          zoneMap.set(domain, zones[0].id);
        } else {
          status.dnsResults[domain] = { ok: false, msg: `Zone not found` };
          setDeployStatus({ ...status });
        }
      } catch (err: any) {
        status.dnsResults[domain] = { ok: false, msg: err.message };
        setDeployStatus({ ...status });
      }
    }

    // Create/verify DNS A records
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
      }
    }

    // Deploy redirect rules per zone
    const updatedStatus = { ...status, phase: "rules" as const };
    setDeployStatus(updatedStatus);

    for (const [domain, hostnames] of domainGroups) {
      const zoneId = zoneMap.get(domain);
      if (!zoneId) continue;

      const expression = hostnames.map((h) => `(http.host eq "${h}")`).join(" or ");
      const newRule = {
        expression,
        description: `Redirect to ${dest}`,
        action: "redirect",
        action_parameters: {
          from_value: {
            status_code: statusCode,
            target_url: { value: dest },
            preserve_query_string: true,
          },
        },
      };

      try {
        let existingRules: any[] = [];
        try {
          const existingRes = await cfProxy({ action: "get-redirect-ruleset", apiToken, zoneId });
          if ((existingRes as any).success && (existingRes as any).ruleset?.rules) {
            // Keep rules not managed by us (don't start with "Redirect to ")
            existingRules = (existingRes as any).ruleset.rules.filter(
              (r: any) => !r.description?.startsWith("Redirect to ")
            );
          }
        } catch { /* no existing ruleset */ }

        const allRules = [...existingRules, newRule];
        const res = await cfProxy({ action: "deploy-redirect-ruleset", apiToken, zoneId, data: { rules: allRules } });

        if ((res as any).success) {
          updatedStatus.ruleResults[domain] = { ok: true, msg: `Rule deployed (${hostnames.length} host${hostnames.length > 1 ? "s" : ""})` };
        } else {
          const errMsg = (res as any).errors?.[0]?.message || "Deploy failed";
          updatedStatus.ruleResults[domain] = { ok: false, msg: errMsg };
        }
      } catch (err: any) {
        updatedStatus.ruleResults[domain] = { ok: false, msg: err.message };
      }
      setDeployStatus({ ...updatedStatus });
    }

    // Save to history
    if (user) {
      for (const hostname of uniqueHostnames) {
        try {
          await supabase.from("redirect_history").upsert({
            user_id: user.id,
            source_url: hostname,
            destination_url: dest,
            domain: extractRootDomain(hostname),
            subdomain: hostname.split(".").length > 2 ? hostname.split(".").slice(0, -2).join(".") : null,
            redirect_type: "redirect_rule",
            status_code: statusCode,
            status: "active",
            zone_id: zoneMap.get(extractRootDomain(hostname)) || null,
          }, { onConflict: "source_url,user_id" as any });
        } catch { /* best effort */ }
      }
    }

    setDeployStatus({ ...updatedStatus, phase: "done" });
    setDeploying(false);
    toast({ title: "Deployment complete" });
  }, [getApiToken, isReady, destinationUrl, redirectType, domainGroups, uniqueHostnames, user, toast]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Bulk Redirect Rules</h2>
        <p className="text-muted-foreground">
          Enter domains/subdomains in bulk and redirect them all to a single destination using Cloudflare Redirect Rules.
        </p>
      </div>

      {/* Credentials */}
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
              <Label>Saved Account</Label>
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
            <Label>Or enter API Token</Label>
            <div className="space-y-2">
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
              {manualToken.startsWith("cfat_") && (
                <div className="space-y-1">
                  <Label className="text-xs">Account ID (Required for Account Tokens)</Label>
                  <Input
                    placeholder="32-character Account ID"
                    value={manualAccountId}
                    onChange={(e) => setManualAccountId(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              )}
            </div>
          </div>
          {(selectedAccountId || tokenValid) && (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Ready
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Redirect Configuration</CardTitle>
          <CardDescription>
            Enter source hostnames (one per line) and a single destination URL where they should all redirect to.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hostnames">Source Hostnames (one per line)</Label>
            <Textarea
              id="hostnames"
              value={hostnamesText}
              onChange={(e) => { setHostnamesText(e.target.value); setShowPreview(false); }}
              placeholder={"ops.example.com\nmail.example.com\nexample.org\nwww.another.com"}
              rows={8}
              className="font-mono text-sm resize-none"
            />
            {uniqueHostnames.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {uniqueHostnames.length} unique hostname{uniqueHostnames.length !== 1 ? "s" : ""} across {domainGroups.size} zone{domainGroups.size !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="space-y-2">
              <Label htmlFor="destination">Destination URL</Label>
              <Input
                id="destination"
                placeholder="https://destination.com"
                value={destinationUrl}
                onChange={(e) => { setDestinationUrl(e.target.value); setShowPreview(false); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={redirectType} onValueChange={(v) => { setRedirectType(v as "301" | "302"); setShowPreview(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="301">301</SelectItem>
                  <SelectItem value="302">302</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={() => setShowPreview(true)} disabled={!isReady} variant="outline">
            <Eye className="h-4 w-4 mr-2" /> Preview Rules
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {showPreview && isReady && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Rule Preview</CardTitle>
            <CardDescription>
              {domainGroups.size} rule{domainGroups.size !== 1 ? "s" : ""} will be created (one per zone), redirecting {uniqueHostnames.length} hostname{uniqueHostnames.length !== 1 ? "s" : ""} → <span className="font-mono text-primary">{destinationUrl}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from(domainGroups.entries()).map(([domain, hostnames], i) => (
              <div key={domain} className="p-4 border rounded-lg bg-muted/30 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Badge variant="secondary">Zone: {domain}</Badge>
                  <Badge variant="outline">{redirectType}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <span className="text-primary font-mono text-xs">{destinationUrl}</span>
                </div>
                <div className="text-xs text-muted-foreground">{hostnames.length} hostname{hostnames.length !== 1 ? "s" : ""}</div>
                <pre className="bg-background border rounded p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                  {hostnames.map((h) => `(http.host eq "${h}")`).join("\n  or ")}
                </pre>
              </div>
            ))}

            {exceedsLimit && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded">
                <AlertTriangle className="h-4 w-4" />
                You have {zoneCount} zones but the Free plan only allows {FREE_PLAN_RULE_LIMIT} redirect rules per zone.
              </div>
            )}

            <Button onClick={handleDeploy} disabled={deploying || !getApiToken()} className="w-full">
              {deploying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              Deploy All Rules
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Deploy Status */}
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

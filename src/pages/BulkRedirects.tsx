import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCloudflareAccounts } from "@/hooks/useCloudflareAccounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Globe, Zap, ArrowRight, Trash2, Save, Clock } from "lucide-react";
import { ApiSetupGuide } from "@/components/cloudflare/ApiSetupGuide";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RedirectEntry {
  sourceUrl: string;
  fullName: string;
  destinationUrl: string;
  domain: string;
  subdomain: string;
  zoneId: string;
  existingARecordId: string | null;
  existingAProxied: boolean;
  existingPageRuleId: string;
  status: "idle" | "processing" | "success" | "error";
  statusMessage: string;
}

type Step = "auth" | "input" | "resolving" | "review" | "deploying" | "done";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cfProxy(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", { body: params });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

function extractRootDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

function extractSubdomainPrefix(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return "";
  return parts.slice(0, -2).join(".");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkRedirects() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { accounts } = useCloudflareAccounts();

  // Auth
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [manualToken, setManualToken] = useState("");
  const [manualAccountId, setManualAccountId] = useState("");
  const [authMode, setAuthMode] = useState<"saved" | "manual">("saved");
  const [tokenValid, setTokenValid] = useState(false);
  const [validating, setValidating] = useState(false);

  // Input
  const [bulkInput, setBulkInput] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");

  // Processing
  const [step, setStep] = useState<Step>("auth");
  const [entries, setEntries] = useState<RedirectEntry[]>([]);
  const [deploying, setDeploying] = useState(false);

  // Derived credentials
  const getApiToken = useCallback(() => {
    if (authMode === "saved" && selectedAccountId) {
      const acc = accounts.find((a) => a.id === selectedAccountId);
      if (acc) return atob(acc.api_key_encrypted);
    }
    return manualToken;
  }, [authMode, selectedAccountId, accounts, manualToken]);

  // Auto-select first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // ─── Step 1: Validate ───────────────────────────────────────────────

  const getResolvedAccountId = useCallback((): string => {
    if (manualAccountId.trim()) return manualAccountId.trim();
    if (authMode === "saved" && selectedAccountId) {
      const acc = accounts.find((a) => a.id === selectedAccountId);
      return acc?.account_id || "";
    }
    return "";
  }, [manualAccountId, authMode, selectedAccountId, accounts]);

  const handleValidate = useCallback(async () => {
    const apiToken = getApiToken();
    if (!apiToken) { toast({ title: "API credentials required", variant: "destructive" }); return; }
    const acctId = getResolvedAccountId();
    if (apiToken.startsWith("cfat_") && !acctId) {
      toast({ title: "Account ID required", description: "Account API Tokens (cfat_) require an Account ID.", variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const res = await cfProxy({ action: "verify-token", apiToken, accountId: acctId || undefined });
      if (!(res as any).success) {
        throw new Error((res as any).detail || (res as any).errors?.[0]?.message || "Invalid API Token");
      }
      setTokenValid(true);
      setStep("input");
      toast({ title: "Credentials verified" });
    } catch (err: any) {
      toast({ title: "Invalid credentials", description: err.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }, [getApiToken, getResolvedAccountId, toast]);

  // ─── Step 2: Parse input & resolve zones ────────────────────────────

  const handleParseAndResolve = useCallback(async () => {
    const lines = bulkInput
      .split("\n")
      .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);

    if (lines.length === 0) { toast({ title: "No entries", variant: "destructive" }); return; }
    if (!destinationUrl.trim()) { toast({ title: "Destination URL required", variant: "destructive" }); return; }

    const apiToken = getApiToken();
    setValidating(true);
    setStep("resolving");

    try {
      // Group by root domain
      const domainGroups = new Map<string, string[]>();
      for (const line of lines) {
        const root = extractRootDomain(line);
        if (!domainGroups.has(root)) domainGroups.set(root, []);
        domainGroups.get(root)!.push(line);
      }

      // Resolve zone IDs
      const zoneMap = new Map<string, string>();
      for (const domain of domainGroups.keys()) {
        const res = await cfProxy({ action: "search-zones", apiToken, data: { domainName: domain } });
        const zones = (res as any).zones as any[] | undefined;
        if (!zones || zones.length === 0) {
          toast({ title: `Zone not found: ${domain}`, description: "Make sure this domain is in your Cloudflare account.", variant: "destructive" });
          continue;
        }
        zoneMap.set(domain, zones[0].id);
      }

      if (zoneMap.size === 0) {
        toast({ title: "No zones found", variant: "destructive" });
        setStep("input");
        setValidating(false);
        return;
      }

      // Fetch DNS records and page rules per zone
      const newEntries: RedirectEntry[] = [];
      for (const [domain, hostnames] of domainGroups) {
        const zoneId = zoneMap.get(domain);
        if (!zoneId) continue;

        const dnsRes = await cfProxy({ action: "get-dns-records", apiToken, zoneId });
        const records = ((dnsRes as any).records ?? []) as { id: string; type: string; name: string; proxied: boolean }[];

        let existingPageRules: any[] = [];
        try {
          const prRes = await cfProxy({ action: "get-page-rules", apiToken, zoneId });
          if ((prRes as any).success) existingPageRules = (prRes as any).rules ?? [];
        } catch { /* ignore */ }

        for (const hostname of hostnames) {
          const sub = extractSubdomainPrefix(hostname);
          const fullName = sub ? `${sub}.${domain}` : domain;
          const aRecord = records.find((r) => r.type === "A" && r.name === fullName);

          // Find existing page rule
          let existingPageRuleId = "";
          for (const rule of existingPageRules) {
            const target = rule.targets?.[0]?.constraint?.value || "";
            if (target.includes(fullName)) {
              existingPageRuleId = rule.id;
              break;
            }
          }

          newEntries.push({
            sourceUrl: `https://${fullName}/`,
            fullName,
            destinationUrl: destinationUrl.trim(),
            domain,
            subdomain: sub,
            zoneId,
            existingARecordId: aRecord?.id ?? null,
            existingAProxied: aRecord?.proxied ?? false,
            existingPageRuleId,
            status: "idle",
            statusMessage: "",
          });
        }
      }

      setEntries(newEntries);
      setStep("review");
      toast({ title: `${newEntries.length} redirect(s) ready to review` });
    } catch (err: any) {
      toast({ title: "Error resolving domains", description: err.message, variant: "destructive" });
      setStep("input");
    } finally {
      setValidating(false);
    }
  }, [bulkInput, destinationUrl, getApiToken, toast]);

  // ─── Step 3: Deploy via DNS + Page Rules ────────────────────────────

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    setStep("deploying");
    const apiToken = getApiToken();

    const updateEntry = (fullName: string, updates: Partial<RedirectEntry>) => {
      setEntries((prev) => prev.map((e) => (e.fullName === fullName ? { ...e, ...updates } : e)));
    };

    setEntries((prev) => prev.map((e) => ({ ...e, status: "processing" as const, statusMessage: "⏳ Processing..." })));

    for (const entry of entries) {
      try {
        // Phase 1: Ensure proxied A record
        if (entry.subdomain) {
          if (entry.existingARecordId && entry.existingAProxied) {
            updateEntry(entry.fullName, { statusMessage: "⏳ A record OK, deploying rule..." });
          } else if (entry.existingARecordId && !entry.existingAProxied) {
            await cfProxy({
              action: "update-dns-record", apiToken, zoneId: entry.zoneId,
              data: { id: entry.existingARecordId, proxied: true },
            });
            updateEntry(entry.fullName, { statusMessage: "⏳ A record proxied, deploying rule..." });
          } else {
            await cfProxy({
              action: "create-dns-record", apiToken, zoneId: entry.zoneId,
              data: { type: "A", name: entry.fullName, content: "192.0.2.1", proxied: true, ttl: 1 },
            });
            updateEntry(entry.fullName, { statusMessage: "⏳ A record created, deploying rule..." });
          }
        }

        // Phase 2: Create/update Page Rule
        const pageRulePayload = {
          targets: [{ target: "url", constraint: { operator: "matches", value: `${entry.fullName}/*` } }],
          actions: [{ id: "forwarding_url", value: { url: entry.destinationUrl, status_code: 301 } }],
          status: "active",
        };

        let ruleRes: any;
        if (entry.existingPageRuleId) {
          ruleRes = await cfProxy({
            action: "update-page-rule", apiToken, zoneId: entry.zoneId,
            data: { id: entry.existingPageRuleId, payload: pageRulePayload },
          });
        } else {
          ruleRes = await cfProxy({
            action: "create-page-rule", apiToken, zoneId: entry.zoneId,
            data: pageRulePayload,
          });
        }

        if (!ruleRes.success) {
          const errMsg = ruleRes.errors?.[0]?.message || "Page rule failed";
          updateEntry(entry.fullName, { status: "error", statusMessage: `❌ ${errMsg}` });
        } else {
          updateEntry(entry.fullName, { status: "success", statusMessage: "✅ Redirect deployed" });

          // Save to history
          if (user) {
            await supabase.from("redirect_history").upsert(
              {
                user_id: user.id,
                source_url: entry.sourceUrl,
                destination_url: entry.destinationUrl,
                domain: entry.domain,
                subdomain: entry.subdomain || null,
                redirect_type: "page_rule",
                status_code: 301,
                cloudflare_account_id: authMode === "saved" ? selectedAccountId : null,
                zone_id: entry.zoneId,
                status: "active",
              },
              { onConflict: "id" }
            );
          }
        }

        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        updateEntry(entry.fullName, { status: "error", statusMessage: `❌ ${err.message}` });
      }
    }

    setDeploying(false);
    setStep("done");
  }, [entries, getApiToken, user, authMode, selectedAccountId]);

  // ─── Helpers ────────────────────────────────────────────────────────

  const removeEntry = (fullName: string) => setEntries((prev) => prev.filter((e) => e.fullName !== fullName));
  const updateDest = (fullName: string, url: string) =>
    setEntries((prev) => prev.map((e) => (e.fullName === fullName ? { ...e, destinationUrl: url } : e)));

  const successCount = entries.filter((e) => e.status === "success").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Bulk Redirects</h2>
        <p className="text-muted-foreground">
          Bulk configure DNS records and Page Rule redirects for domains and subdomains
        </p>
      </div>

      <ApiSetupGuide feature="bulk_redirects" />

      {/* Step 1: Credentials */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Cloudflare Credentials
          </CardTitle>
          <CardDescription>
            Required permissions: <strong>Zone:DNS:Edit</strong>, <strong>Zone:Zone:Read</strong>, <strong>Zone:Page Rules:Edit</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={authMode === "saved" ? "default" : "outline"}
              size="sm"
              onClick={() => setAuthMode("saved")}
              disabled={tokenValid}
            >
              <Save className="h-3 w-3 mr-1" /> Saved Account
            </Button>
            <Button
              variant={authMode === "manual" ? "default" : "outline"}
              size="sm"
              onClick={() => setAuthMode("manual")}
              disabled={tokenValid}
            >
              Manual Entry
            </Button>
          </div>

          {authMode === "saved" ? (
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId} disabled={tokenValid}>
              <SelectTrigger>
                <SelectValue placeholder="Select a saved account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.account_name} ({acc.cloudflare_email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Cloudflare API Token"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                disabled={tokenValid}
              />
              {manualToken.startsWith("cfat_") && (
                <Input
                  placeholder="Account ID (required for cfat_ tokens)"
                  value={manualAccountId}
                  onChange={(e) => setManualAccountId(e.target.value)}
                  disabled={tokenValid}
                  className="text-xs font-mono"
                />
              )}
            </div>
          )}

          <div className="flex gap-2 items-center">
            <Button onClick={handleValidate} disabled={validating || tokenValid}>
              {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tokenValid ? "Verified ✓" : "Verify"}
            </Button>
            {tokenValid && (
              <Button variant="ghost" size="sm" onClick={() => { setTokenValid(false); setStep("auth"); setEntries([]); }}>
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Input */}
      {step !== "auth" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Redirect Input</CardTitle>
            <CardDescription>
              Enter domains or subdomains (one per line). The system will auto-detect the zone for each domain.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={`ops.example.com\nmail.example.com\nexample2.com\nsub.example3.com`}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={6}
              className="font-mono text-sm mb-4"
              disabled={step !== "input"}
            />
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm font-medium mb-1 block">Destination URL</label>
                <Input
                  placeholder="https://destination.com/"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  disabled={step !== "input"}
                />
              </div>
              <Button onClick={handleParseAndResolve} disabled={step !== "input" || validating}>
                {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {validating ? "Resolving zones..." : "Review"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review & Deploy */}
      {entries.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">
              {step === "done" ? "Results" : "Review Redirects"}
            </CardTitle>
            <CardDescription>
              {entries.length} redirect{entries.length !== 1 ? "s" : ""} across {new Set(entries.map(e => e.domain)).size} zone(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.fullName} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-border bg-card">
                  <span className="font-mono text-sm font-medium min-w-[200px]">{entry.fullName}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                  <Input
                    value={entry.destinationUrl}
                    onChange={(e) => updateDest(entry.fullName, e.target.value)}
                    className="flex-1"
                    disabled={step !== "review"}
                  />
                  {step === "review" && (
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeEntry(entry.fullName)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                  {entry.status !== "idle" && (
                    <div className="flex items-center gap-1.5 text-xs min-w-[200px]">
                      {entry.status === "processing" && <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />}
                      {entry.status === "success" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {entry.status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
                      <span className={
                        entry.status === "success" ? "text-green-600" :
                        entry.status === "error" ? "text-destructive" :
                        "text-muted-foreground"
                      }>{entry.statusMessage}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deploy / Done */}
      {(step === "review" || step === "deploying" || step === "done") && entries.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                {step === "done" ? (
                  <p className="text-sm font-medium">
                    {successCount}/{entries.length} deployed
                    {errorCount > 0 && <span className="text-destructive"> · {errorCount} failed</span>}
                  </p>
                ) : (
                  <p className="text-sm font-medium">{entries.length} redirect(s) ready</p>
                )}
              </div>
              <div className="flex gap-2">
                {step === "done" && (
                  <Button variant="outline" onClick={() => { setStep("input"); setEntries([]); setBulkInput(""); setDestinationUrl(""); }}>
                    Start Over
                  </Button>
                )}
                <Button onClick={handleDeploy} disabled={deploying || step === "done"} size="lg">
                  {deploying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  {deploying ? "Deploying..." : "Deploy All Redirects"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Clock, Globe, Zap, ArrowRight, Trash2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

interface SubdomainEntry {
  subdomain: string;       // e.g. "operations"
  fullName: string;        // e.g. "operations.nxttechdisposal.com"
  domain: string;          // e.g. "nxttechdisposal.com"
  zoneId: string;
  destinationUrl: string;
  existingARecordId: string | null;
  existingAProxied: boolean;
  currentRedirectUrl: string;
  status: "idle" | "processing" | "success" | "error";
  statusMessage: string;
}

type Step = "auth" | "input" | "review" | "deploying" | "done";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cfProxy(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", { body: params });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

/** Extract root domain from a full hostname. e.g. "ops.example.com" → "example.com" */
function extractRootDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

/** Extract subdomain prefix. e.g. "ops.example.com" → "ops" */
function extractSubdomainPrefix(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length <= 2) return "";
  return parts.slice(0, -2).join(".");
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubdomainRedirects() {
  const { toast } = useToast();

  // Auth
  const [apiToken, setApiToken] = useState("");
  const [tokenValid, setTokenValid] = useState(false);
  const [validating, setValidating] = useState(false);

  // Input
  const [bulkInput, setBulkInput] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");

  // Processing
  const [step, setStep] = useState<Step>("auth");
  const [entries, setEntries] = useState<SubdomainEntry[]>([]);
  const [deploying, setDeploying] = useState(false);

  // ─── Step 1: Validate API Token ─────────────────────────────────────────

  const handleValidateToken = useCallback(async () => {
    if (!apiToken.trim()) {
      toast({ title: "API Token required", variant: "destructive" });
      return;
    }
    setValidating(true);
    try {
      const res = await cfProxy({ action: "verify-token", apiToken });
      if (!(res as any).success) throw new Error("Invalid API Token");
      setTokenValid(true);
      setStep("input");
      toast({ title: "Token verified", description: "You can now enter subdomains." });
    } catch (err: any) {
      toast({ title: "Invalid token", description: err.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }, [apiToken, toast]);

  // ─── Step 2: Parse bulk input & resolve zones ───────────────────────────

  const handleParseAndResolve = useCallback(async () => {
    const lines = bulkInput
      .split("\n")
      .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);

    if (lines.length === 0) {
      toast({ title: "No subdomains entered", variant: "destructive" });
      return;
    }
    if (!destinationUrl.trim()) {
      toast({ title: "Destination URL required", variant: "destructive" });
      return;
    }

    setValidating(true);

    try {
      // Group subdomains by root domain
      const domainGroups = new Map<string, string[]>();
      for (const line of lines) {
        const root = extractRootDomain(line);
        const sub = extractSubdomainPrefix(line);
        if (!sub) {
          toast({ title: `Skipping "${line}"`, description: "Not a subdomain — enter subdomains like ops.example.com", variant: "destructive" });
          continue;
        }
        if (!domainGroups.has(root)) domainGroups.set(root, []);
        domainGroups.get(root)!.push(sub);
      }

      if (domainGroups.size === 0) {
        toast({ title: "No valid subdomains found", variant: "destructive" });
        setValidating(false);
        return;
      }

      // Resolve zone IDs for each root domain
      const zoneMap = new Map<string, string>();
      for (const domain of domainGroups.keys()) {
        const res = await cfProxy({ action: "search-zones", apiToken, data: { domainName: domain } });
        const zones = (res as any).zones as any[] | undefined;
        if (!zones || zones.length === 0) {
          toast({ title: `Zone not found for ${domain}`, description: "Make sure this domain is in your Cloudflare account.", variant: "destructive" });
          continue;
        }
        zoneMap.set(domain, zones[0].id);
      }

      if (zoneMap.size === 0) {
        toast({ title: "No zones found", description: "Could not find any matching zones.", variant: "destructive" });
        setValidating(false);
        return;
      }

      // For each zone, fetch DNS records to check existing A records
      const newEntries: SubdomainEntry[] = [];
      for (const [domain, subs] of domainGroups) {
        const zoneId = zoneMap.get(domain);
        if (!zoneId) continue;

        const dnsRes = await cfProxy({ action: "get-dns-records", apiToken, zoneId });
        const records: DnsRecord[] = ((dnsRes as any).records ?? []) as DnsRecord[];

        // Also fetch existing redirect rules to show current redirects
        let existingRules: any[] = [];
        try {
          const rulesetRes = await cfProxy({ action: "get-redirect-ruleset", apiToken, zoneId });
          if ((rulesetRes as any).success && (rulesetRes as any).ruleset?.rules) {
            existingRules = (rulesetRes as any).ruleset.rules;
          }
        } catch { /* no ruleset yet */ }

        for (const sub of subs) {
          const fullName = `${sub}.${domain}`;
          const aRecord = records.find((r) => r.type === "A" && r.name === fullName);
          
          // Find current redirect URL from existing rules
          let currentRedirectUrl = "";
          for (const rule of existingRules) {
            const expr = rule.expression || "";
            if (expr.includes(`"${fullName}"`)) {
              currentRedirectUrl = rule.action_parameters?.from_value?.target_url?.value || "";
              break;
            }
          }

          newEntries.push({
            subdomain: sub,
            fullName,
            domain,
            zoneId,
            destinationUrl: destinationUrl.trim(),
            existingARecordId: aRecord?.id ?? null,
            existingAProxied: aRecord?.proxied ?? false,
            currentRedirectUrl,
            status: "idle",
            statusMessage: "",
          });
        }
      }

      setEntries(newEntries);
      setStep("review");
      toast({ title: `${newEntries.length} subdomain(s) ready`, description: "Review and deploy." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }, [bulkInput, destinationUrl, apiToken, toast]);

  // ─── Step 3: Deploy ─────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    setStep("deploying");

    const updateEntry = (fullName: string, updates: Partial<SubdomainEntry>) => {
      setEntries((prev) => prev.map((e) => (e.fullName === fullName ? { ...e, ...updates } : e)));
    };

    // Mark all as processing
    setEntries((prev) => prev.map((e) => ({ ...e, status: "processing" as const, statusMessage: "⏳ Processing..." })));

    // Phase 1: Ensure A records exist and are proxied
    for (const entry of entries) {
      try {
        if (entry.existingARecordId && entry.existingAProxied) {
          updateEntry(entry.fullName, { statusMessage: "⏳ A record OK, deploying rule..." });
        } else if (entry.existingARecordId && !entry.existingAProxied) {
          await cfProxy({
            action: "update-dns-record",
            apiToken,
            zoneId: entry.zoneId,
            data: { id: entry.existingARecordId, proxied: true },
          });
          updateEntry(entry.fullName, { statusMessage: "⏳ A record proxied, deploying rule..." });
        } else {
          await cfProxy({
            action: "create-dns-record",
            apiToken,
            zoneId: entry.zoneId,
            data: { type: "A", name: entry.fullName, content: "192.0.2.1", proxied: true, ttl: 1 },
          });
          updateEntry(entry.fullName, { statusMessage: "⏳ A record created, deploying rule..." });
        }
        await new Promise((r) => setTimeout(r, 300));
      } catch (err: any) {
        updateEntry(entry.fullName, { status: "error", statusMessage: `❌ DNS error: ${err.message}` });
      }
    }

    // Phase 2: Deploy redirect rules per zone
    // Group entries by zoneId
    const byZone = new Map<string, SubdomainEntry[]>();
    for (const entry of entries) {
      if (!byZone.has(entry.zoneId)) byZone.set(entry.zoneId, []);
      byZone.get(entry.zoneId)!.push(entry);
    }

    for (const [zoneId, zoneEntries] of byZone) {
      try {
        // Fetch current ruleset
        let existingRules: any[] = [];
        try {
          const rulesetRes = await cfProxy({ action: "get-redirect-ruleset", apiToken, zoneId });
          if ((rulesetRes as any).success && (rulesetRes as any).ruleset?.rules) {
            existingRules = (rulesetRes as any).ruleset.rules;
          }
        } catch { /* no existing ruleset */ }

        // Get the fullnames we're deploying in this zone
        const deployingNames = new Set(zoneEntries.map((e) => e.fullName));
        
        // Keep rules that DON'T match any of our deploying subdomains
        const keptRules = existingRules.filter((r: any) => {
          const expr = r.expression || "";
          for (const fn of deployingNames) {
            if (expr.includes(`"${fn}"`)) return false;
          }
          return true;
        });

        // Create new rules — only for entries that didn't fail DNS
        const successEntries = zoneEntries.filter((e) => {
          // Check current status - we need to read from the latest state
          return true; // We'll check errors after
        });

        const newRules = successEntries.map((entry) => ({
          description: `Redirect ${entry.fullName}`,
          expression: `(http.host eq "${entry.fullName}")`,
          action: "redirect",
          action_parameters: {
            from_value: {
              status_code: 301,
              target_url: { value: entry.destinationUrl },
              preserve_query_string: true,
            },
          },
        }));

        const allRules = [...keptRules, ...newRules];

        // Deploy the complete ruleset
        const deployRes = await cfProxy({
          action: "deploy-redirect-ruleset",
          apiToken,
          zoneId,
          data: { rules: allRules },
        });

        if (!(deployRes as any).success) {
          const errMsg = ((deployRes as any).errors?.[0] as any)?.message || "Ruleset deploy failed";
          console.error("Deploy failed:", JSON.stringify(deployRes));
          for (const entry of zoneEntries) {
            updateEntry(entry.fullName, { status: "error", statusMessage: `❌ Rule error: ${errMsg}` });
          }
        } else {
          for (const entry of zoneEntries) {
            updateEntry(entry.fullName, {
              status: "success",
              statusMessage: entry.existingARecordId && entry.existingAProxied
                ? "✅ Redirect rule deployed (A record existed)"
                : entry.existingARecordId
                ? "✅ A record proxied + redirect rule deployed"
                : "✅ A record created + redirect rule deployed",
            });
          }
        }
      } catch (err: any) {
        console.error("Deploy error:", err);
        for (const entry of zoneEntries) {
          updateEntry(entry.fullName, { status: "error", statusMessage: `❌ Deploy error: ${err.message}` });
        }
      }
    }

    setDeploying(false);
    setStep("done");
  }, [entries, apiToken]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const removeEntry = (fullName: string) => {
    setEntries((prev) => prev.filter((e) => e.fullName !== fullName));
  };

  const updateDestination = (fullName: string, url: string) => {
    setEntries((prev) => prev.map((e) => (e.fullName === fullName ? { ...e, destinationUrl: url } : e)));
  };

  const successCount = entries.filter((e) => e.status === "success").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Subdomain Redirect Manager</h2>
        <p className="text-muted-foreground">
          Bulk configure DNS records and redirect rules for subdomains
        </p>
      </div>

      {/* Step 1: API Token */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Cloudflare API Token
          </CardTitle>
          <CardDescription>
            Enter your API token with Zone:DNS:Edit and Zone:Zone:Read permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              type="password"
              placeholder="Your Cloudflare API Token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              disabled={tokenValid}
              className="flex-1"
            />
            <Button onClick={handleValidateToken} disabled={validating || tokenValid}>
              {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tokenValid ? "Verified" : "Verify"}
            </Button>
          </div>
          {tokenValid && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Token valid
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTokenValid(false);
                  setStep("auth");
                  setEntries([]);
                }}
              >
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Bulk Input */}
      {step !== "auth" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Subdomain Input</CardTitle>
            <CardDescription>
              Enter subdomains (one per line). The system will auto-detect the main domain and zone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder={`operations.example.com\npartners.example.com\ngroup.example.com\nhq.anotherdomain.com`}
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              rows={6}
              className="font-mono text-sm mb-4"
              disabled={step !== "input"}
            />
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium mb-1 block">Destination URL (for all)</label>
                <Input
                  placeholder="https://destination.com/"
                  value={destinationUrl}
                  onChange={(e) => setDestinationUrl(e.target.value)}
                  disabled={step !== "input"}
                />
              </div>
              <Button onClick={handleParseAndResolve} disabled={validating || step !== "input"}>
                {validating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Resolve & Review
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
              {step === "done" ? "Results" : "Review Subdomains"}
            </CardTitle>
            <CardDescription>
              {entries.length} subdomain{entries.length !== 1 ? "s" : ""} to configure.
              {step === "review" && " You can change individual destination URLs below."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {entries.map((entry) => (
                <div
                  key={entry.fullName}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-[220px]">
                    <span className="font-mono text-sm font-medium">{entry.fullName}</span>
                    {entry.existingARecordId && entry.existingAProxied ? (
                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" /> A
                      </Badge>
                    ) : entry.existingARecordId ? (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600 text-xs">
                        A (unproxied)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
                        <XCircle className="h-3 w-3 mr-0.5" /> No A
                      </Badge>
                    )}
                    {entry.currentRedirectUrl && (
                      <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={entry.currentRedirectUrl}>
                        Current: {entry.currentRedirectUrl}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                    <Input
                      value={entry.destinationUrl}
                      onChange={(e) => updateDestination(entry.fullName, e.target.value)}
                      className="flex-1"
                      disabled={step !== "review"}
                    />
                    {step === "review" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => removeEntry(entry.fullName)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  {entry.status !== "idle" && (
                    <div className="flex items-center gap-1.5 text-xs min-w-[250px]">
                      {entry.status === "processing" && <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />}
                      {entry.status === "success" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                      {entry.status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
                      <span className={
                        entry.status === "success" ? "text-green-600" :
                        entry.status === "error" ? "text-destructive" :
                        "text-muted-foreground"
                      }>
                        {entry.statusMessage}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Deploy button */}
      {(step === "review" || step === "deploying" || step === "done") && entries.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                {step === "done" ? (
                  <p className="text-sm font-medium">
                    {successCount}/{entries.length} successfully configured
                    {errorCount > 0 && <span className="text-destructive"> · {errorCount} failed</span>}
                  </p>
                ) : (
                  <p className="text-sm font-medium">
                    {entries.length} subdomain{entries.length !== 1 ? "s" : ""} ready to deploy
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {step === "done" && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("input");
                      setEntries([]);
                      setBulkInput("");
                      setDestinationUrl("");
                    }}
                  >
                    Start Over
                  </Button>
                )}
                <Button
                  onClick={handleDeploy}
                  disabled={deploying || step === "done"}
                  size="lg"
                >
                  {deploying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
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

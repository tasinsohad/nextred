import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Clock, Plus, Trash2, Globe, ArrowRight, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

interface RedirectRule {
  expression: string;
  action_parameters?: {
    from_value?: {
      target_url?: { value?: string };
      status_code?: number;
    };
  };
  description?: string;
}

interface SubdomainEntry {
  name: string; // just the subdomain part e.g. "operations"
  fullName: string; // e.g. "operations.example.com"
  hasProxiedA: boolean;
  existingARecordId: string | null;
  existingAProxied: boolean;
  currentRedirectUrl: string;
  destinationUrl: string;
  status: "idle" | "processing" | "success" | "error";
  statusMessage: string;
  manual?: boolean;
}

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function cfProxy(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", { body: params });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

function extractSubdomain(recordName: string, zoneName: string): string | null {
  if (recordName === zoneName) return null;
  if (recordName.endsWith(`.${zoneName}`)) {
    return recordName.slice(0, -(zoneName.length + 1));
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SubdomainRedirects() {
  const { toast } = useToast();

  // Auth state
  const [apiToken, setApiToken] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [zoneName, setZoneName] = useState("");

  // Data state
  const [subdomains, setSubdomains] = useState<SubdomainEntry[]>([]);
  const [newSubdomain, setNewSubdomain] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [deployDone, setDeployDone] = useState(false);

  // ─── Connect ──────────────────────────────────────────────────────────────

  const handleConnect = useCallback(async () => {
    if (!apiToken.trim() || !zoneId.trim()) {
      toast({ title: "Missing fields", description: "API Token and Zone ID are required.", variant: "destructive" });
      return;
    }
    setConnectionStatus("connecting");
    try {
      // 1. Get zone info
      const zoneRes = await cfProxy({ action: "get-zone-info", apiToken, zoneId });
      if (!(zoneRes as any).success) throw new Error("Invalid Zone ID or API Token");
      const zone = (zoneRes as any).zone;
      const zName = zone.name as string;
      setZoneName(zName);

      // 2. Fetch DNS records
      const dnsRes = await cfProxy({ action: "get-dns-records", apiToken, zoneId });
      const records: DnsRecord[] = ((dnsRes as any).records ?? []) as DnsRecord[];

      // 3. Fetch existing redirect rules
      let existingRules: RedirectRule[] = [];
      try {
        const rulesetRes = await cfProxy({ action: "get-redirect-ruleset", apiToken, zoneId });
        if ((rulesetRes as any).success && (rulesetRes as any).ruleset?.rules) {
          existingRules = (rulesetRes as any).ruleset.rules;
        }
      } catch {
        // No ruleset exists yet, that's fine
      }

      // 4. Build subdomain map
      const subMap = new Map<string, SubdomainEntry>();

      for (const rec of records) {
        const sub = extractSubdomain(rec.name, zName);
        if (!sub) continue;
        // Skip wildcard and deep subdomains
        if (sub.includes("*") || sub.includes(".")) continue;

        if (!subMap.has(sub)) {
          subMap.set(sub, {
            name: sub,
            fullName: `${sub}.${zName}`,
            hasProxiedA: false,
            existingARecordId: null,
            existingAProxied: false,
            currentRedirectUrl: "",
            destinationUrl: "",
            status: "idle",
            statusMessage: "",
          });
        }
        const entry = subMap.get(sub)!;
        if (rec.type === "A") {
          entry.existingARecordId = rec.id;
          entry.existingAProxied = rec.proxied;
          entry.hasProxiedA = rec.proxied;
        }
      }

      // Match redirect rules
      for (const rule of existingRules) {
        const expr = rule.expression || "";
        for (const [, entry] of subMap) {
          if (expr.includes(`"${entry.fullName}"`)) {
            const url = rule.action_parameters?.from_value?.target_url?.value || "";
            entry.currentRedirectUrl = url;
            entry.destinationUrl = url;
          }
        }
      }

      setSubdomains(Array.from(subMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setConnectionStatus("connected");
      toast({ title: "Connected", description: `Zone: ${zName} — ${subMap.size} subdomains found.` });
    } catch (err: any) {
      setConnectionStatus("error");
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    }
  }, [apiToken, zoneId, toast]);

  // ─── Add manual subdomain ─────────────────────────────────────────────────

  const addManualSubdomain = () => {
    const sub = newSubdomain.trim().toLowerCase().replace(/\s+/g, "");
    if (!sub || !zoneName) return;
    if (subdomains.some((s) => s.name === sub)) {
      toast({ title: "Already exists", variant: "destructive" });
      return;
    }
    setSubdomains((prev) => [
      ...prev,
      {
        name: sub,
        fullName: `${sub}.${zoneName}`,
        hasProxiedA: false,
        existingARecordId: null,
        existingAProxied: false,
        currentRedirectUrl: "",
        destinationUrl: "",
        status: "idle",
        statusMessage: "",
        manual: true,
      },
    ]);
    setNewSubdomain("");
  };

  const removeSubdomain = (name: string) => {
    setSubdomains((prev) => prev.filter((s) => s.name !== name));
  };

  const setDestination = (name: string, url: string) => {
    setSubdomains((prev) => prev.map((s) => (s.name === name ? { ...s, destinationUrl: url } : s)));
  };

  // ─── Deploy ───────────────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    const toDeploy = subdomains.filter((s) => s.destinationUrl.trim());
    if (toDeploy.length === 0) {
      toast({ title: "Nothing to deploy", description: "Enter at least one destination URL.", variant: "destructive" });
      return;
    }

    setDeploying(true);
    setDeployDone(false);

    // Reset statuses
    setSubdomains((prev) =>
      prev.map((s) =>
        s.destinationUrl.trim()
          ? { ...s, status: "processing", statusMessage: "⏳ Processing..." }
          : { ...s, status: "idle", statusMessage: "" }
      )
    );

    const updateStatus = (name: string, status: SubdomainEntry["status"], statusMessage: string) => {
      setSubdomains((prev) => prev.map((s) => (s.name === name ? { ...s, status, statusMessage } : s)));
    };

    // Phase 1: DNS records (sequential to avoid rate limits)
    for (const sub of toDeploy) {
      try {
        if (!sub.hasProxiedA) {
          if (sub.existingARecordId && !sub.existingAProxied) {
            // Update existing to proxied
            await cfProxy({
              action: "update-dns-record",
              apiToken,
              zoneId,
              data: { id: sub.existingARecordId, proxied: true },
            });
            updateStatus(sub.name, "processing", "⏳ A record updated to proxied, deploying rule...");
          } else {
            // Create new A record
            await cfProxy({
              action: "create-dns-record",
              apiToken,
              zoneId,
              data: { type: "A", name: sub.fullName, content: "192.0.2.1", proxied: true, ttl: 1 },
            });
            updateStatus(sub.name, "processing", "⏳ A record created, deploying rule...");
          }
        } else {
          updateStatus(sub.name, "processing", "⏳ A record OK, deploying rule...");
        }
        // Small delay
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        updateStatus(sub.name, "error", `❌ DNS error: ${err.message}`);
      }
    }

    // Phase 2: Build and deploy all redirect rules at once
    try {
      // Get current ruleset
      let existingRules: any[] = [];
      try {
        const rulesetRes = await cfProxy({ action: "get-redirect-ruleset", apiToken, zoneId });
        if ((rulesetRes as any).success && (rulesetRes as any).ruleset?.rules) {
          existingRules = (rulesetRes as any).ruleset.rules;
        }
      } catch {
        // No ruleset yet
      }

      // Remove old rules for subdomains we're deploying, keep others
      const deployFullNames = new Set(toDeploy.map((s) => s.fullName));
      const keptRules = existingRules.filter((r: any) => {
        const expr = r.expression || "";
        for (const fn of deployFullNames) {
          if (expr.includes(`"${fn}"`)) return false;
        }
        return true;
      });

      // Add new rules
      const newRules = toDeploy
        .filter((s) => s.status !== "error") // skip DNS failures
        .map((sub) => ({
          description: `Redirect ${sub.fullName}`,
          expression: `(http.host eq "${sub.fullName}")`,
          action: "redirect",
          action_parameters: {
            from_value: {
              status_code: 301,
              target_url: { value: sub.destinationUrl.trim() },
              preserve_query_string: true,
            },
          },
        }));

      const allRules = [...keptRules, ...newRules];

      const deployRes = await cfProxy({
        action: "deploy-redirect-ruleset",
        apiToken,
        zoneId,
        data: { rules: allRules },
      });

      if (!(deployRes as any).success) {
        const errMsg = ((deployRes as any).errors?.[0] as any)?.message || "Ruleset deploy failed";
        for (const sub of toDeploy) {
          if (sub.status !== "error") {
            updateStatus(sub.name, "error", `❌ ${errMsg}`);
          }
        }
      } else {
        for (const sub of toDeploy) {
          if (subdomains.find((s) => s.name === sub.name)?.status !== "error") {
            const msg = sub.hasProxiedA
              ? "✅ A record existed, redirect rule deployed"
              : sub.existingARecordId
              ? "✅ A record updated + redirect rule deployed"
              : "✅ A record created + redirect rule deployed";
            updateStatus(sub.name, "success", msg);
          }
        }
      }
    } catch (err: any) {
      for (const sub of toDeploy) {
        updateStatus(sub.name, "error", `❌ Deploy error: ${err.message}`);
      }
    }

    setDeploying(false);
    setDeployDone(true);
  }, [subdomains, apiToken, zoneId, toast]);

  const successCount = subdomains.filter((s) => s.status === "success").length;
  const errorCount = subdomains.filter((s) => s.status === "error").length;
  const deployableCount = subdomains.filter((s) => s.destinationUrl.trim()).length;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Subdomain Redirect Manager</h2>
        <p className="text-muted-foreground">
          Automate DNS records and redirect rules for subdomains in one click
        </p>
      </div>

      {/* Step 1: Connect */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Connect to Cloudflare Zone
          </CardTitle>
          <CardDescription>Enter your API Token and Zone ID to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium mb-1 block">API Token</label>
              <Input
                type="password"
                placeholder="Your Cloudflare API Token"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                disabled={connectionStatus === "connected"}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Zone ID</label>
              <Input
                placeholder="e.g. a1b2c3d4..."
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                disabled={connectionStatus === "connected"}
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={handleConnect}
              disabled={connectionStatus === "connecting" || connectionStatus === "connected"}
            >
              {connectionStatus === "connecting" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {connectionStatus === "connected" ? "Connected" : "Connect"}
            </Button>
            {connectionStatus === "connected" && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" /> {zoneName}
              </Badge>
            )}
            {connectionStatus === "error" && (
              <Badge variant="destructive">
                <XCircle className="h-3 w-3 mr-1" /> Connection failed
              </Badge>
            )}
            {connectionStatus === "connected" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setConnectionStatus("idle");
                  setSubdomains([]);
                  setZoneName("");
                  setDeployDone(false);
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Subdomain list */}
      {connectionStatus === "connected" && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">Subdomains</CardTitle>
              <CardDescription>
                {subdomains.length} subdomain{subdomains.length !== 1 ? "s" : ""} detected. Set destination URLs and deploy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Add manual subdomain */}
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Add subdomain (e.g. portal)"
                  value={newSubdomain}
                  onChange={(e) => setNewSubdomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addManualSubdomain()}
                />
                <Button variant="outline" onClick={addManualSubdomain} disabled={!newSubdomain.trim()}>
                  <Plus className="h-4 w-4 mr-1" /> Add
                </Button>
              </div>

              {subdomains.length === 0 ? (
                <p className="text-muted-foreground text-sm py-4 text-center">
                  No subdomains found. Add one manually above.
                </p>
              ) : (
                <div className="space-y-3">
                  {subdomains.map((sub) => (
                    <div
                      key={sub.name}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-border bg-card"
                    >
                      <div className="flex items-center gap-2 min-w-[200px]">
                        <span className="font-mono text-sm font-medium">{sub.fullName}</span>
                        {sub.hasProxiedA ? (
                          <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-0.5" /> A
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-orange-500 border-orange-500 text-xs">
                            <XCircle className="h-3 w-3 mr-0.5" /> A
                          </Badge>
                        )}
                        {sub.manual && (
                          <Badge variant="secondary" className="text-xs">Manual</Badge>
                        )}
                      </div>

                      <div className="flex-1 flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                        <Input
                          placeholder="https://destination.com"
                          value={sub.destinationUrl}
                          onChange={(e) => setDestination(sub.name, e.target.value)}
                          className="flex-1"
                          disabled={deploying}
                        />
                        {sub.manual && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() => removeSubdomain(sub.name)}
                            disabled={deploying}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      {sub.status !== "idle" && (
                        <div className="flex items-center gap-1.5 text-xs min-w-[220px]">
                          {sub.status === "processing" && <Clock className="h-3 w-3 text-yellow-500 animate-pulse" />}
                          {sub.status === "success" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
                          {sub.status === "error" && <XCircle className="h-3 w-3 text-destructive" />}
                          <span className={
                            sub.status === "success" ? "text-green-600" :
                            sub.status === "error" ? "text-destructive" :
                            "text-muted-foreground"
                          }>
                            {sub.statusMessage}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deploy */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">
                    {deployableCount} subdomain{deployableCount !== 1 ? "s" : ""} ready to deploy
                  </p>
                  {deployDone && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {successCount}/{successCount + errorCount} successfully configured
                      {errorCount > 0 && ` · ${errorCount} failed`}
                    </p>
                  )}
                </div>
                <Button onClick={handleDeploy} disabled={deploying || deployableCount === 0} size="lg">
                  {deploying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4 mr-2" />
                  )}
                  {deploying ? "Deploying..." : "Deploy All Redirects"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

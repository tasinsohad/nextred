import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCloudflareAccounts } from "@/hooks/useCloudflareAccounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Globe, Zap, ArrowRight, Trash2, Save, Clock } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RedirectEntry {
  sourceUrl: string;
  destinationUrl: string;
  domain: string;
  subdomain: string;
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

async function waitForOperation(apiToken: string, accountId: string, operationId: string, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await cfProxy({ action: "check-bulk-operation", apiToken, accountId, data: { operationId } });
    const op = res.operation as { status?: string } | undefined;
    if (op?.status === "completed") return true;
    if (op?.status === "failed") return false;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
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
  const [listName, setListName] = useState("nextus_redirects");

  // Processing
  const [step, setStep] = useState<Step>("auth");
  const [entries, setEntries] = useState<RedirectEntry[]>([]);
  const [deploying, setDeploying] = useState(false);

  // Derived credentials
  const getCredentials = useCallback(() => {
    if (authMode === "saved" && selectedAccountId) {
      const acc = accounts.find((a) => a.id === selectedAccountId);
      if (acc) return { apiToken: atob(acc.api_key_encrypted), accountId: acc.account_id || "" };
    }
    return { apiToken: manualToken, accountId: manualAccountId };
  }, [authMode, selectedAccountId, accounts, manualToken, manualAccountId]);

  // Auto-select first account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // ─── Step 1: Validate ───────────────────────────────────────────────

  const handleValidate = useCallback(async () => {
    const { apiToken, accountId } = getCredentials();
    if (!apiToken) { toast({ title: "API credentials required", variant: "destructive" }); return; }
    if (!accountId) { toast({ title: "Account ID required", variant: "destructive" }); return; }
    setValidating(true);
    try {
      const res = await cfProxy({ action: "verify-token", apiToken });
      if (!(res as any).success) throw new Error("Invalid API Token");
      setTokenValid(true);
      setStep("input");
      toast({ title: "Credentials verified" });
    } catch (err: any) {
      toast({ title: "Invalid credentials", description: err.message, variant: "destructive" });
    } finally {
      setValidating(false);
    }
  }, [getCredentials, toast]);

  // ─── Step 2: Parse input ────────────────────────────────────────────

  const handleParseInput = useCallback(() => {
    const lines = bulkInput
      .split("\n")
      .map((l) => l.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter(Boolean);

    if (lines.length === 0) { toast({ title: "No entries", variant: "destructive" }); return; }
    if (!destinationUrl.trim()) { toast({ title: "Destination URL required", variant: "destructive" }); return; }

    const newEntries: RedirectEntry[] = lines.map((line) => ({
      sourceUrl: `https://${line}/`,
      destinationUrl: destinationUrl.trim(),
      domain: extractRootDomain(line),
      subdomain: extractSubdomainPrefix(line),
      status: "idle",
      statusMessage: "",
    }));

    setEntries(newEntries);
    setStep("review");
    toast({ title: `${newEntries.length} redirect(s) ready to review` });
  }, [bulkInput, destinationUrl, toast]);

  // ─── Step 3: Deploy via Bulk Redirect API ───────────────────────────

  const handleDeploy = useCallback(async () => {
    setDeploying(true);
    setStep("deploying");
    const { apiToken, accountId } = getCredentials();

    const updateEntry = (src: string, updates: Partial<RedirectEntry>) => {
      setEntries((prev) => prev.map((e) => (e.sourceUrl === src ? { ...e, ...updates } : e)));
    };

    setEntries((prev) => prev.map((e) => ({ ...e, status: "processing" as const, statusMessage: "⏳ Processing..." })));

    try {
      // Step 1: Find or create the redirect list
      updateEntry(entries[0].sourceUrl, { statusMessage: "⏳ Finding/creating redirect list..." });

      const listsRes = await cfProxy({ action: "list-bulk-redirect-lists", apiToken, accountId });
      const existingLists = ((listsRes as any).lists ?? []) as { id: string; name: string; kind: string }[];
      const redirectList = existingLists.find((l) => l.kind === "redirect" && l.name === listName);

      let listId: string;
      if (redirectList) {
        listId = redirectList.id;
      } else {
        const createRes = await cfProxy({
          action: "create-bulk-redirect-list",
          apiToken, accountId,
          data: { name: listName, description: "Managed by Nextus AI" },
        });
        if (!(createRes as any).success) throw new Error("Failed to create redirect list");
        listId = (createRes as any).list.id;
      }

      // Step 2: Get existing items
      const existingItemsRes = await cfProxy({
        action: "get-bulk-redirect-list-items",
        apiToken, accountId,
        data: { listId },
      });
      const existingItems = ((existingItemsRes as any).items ?? []) as {
        id: string;
        redirect: { source_url: string; target_url: string };
      }[];

      // Step 3: Build new items list - merge with existing
      const existingMap = new Map(existingItems.map((item) => [item.redirect.source_url, item]));

      // Add/update entries
      for (const entry of entries) {
        existingMap.set(entry.sourceUrl, {
          id: "",
          redirect: {
            source_url: entry.sourceUrl,
            target_url: entry.destinationUrl,
          },
        });
      }

      // Build the items array for replacement
      const allItems = Array.from(existingMap.values()).map((item) => ({
        redirect: {
          source_url: item.redirect.source_url,
          target_url: item.redirect.target_url,
          status_code: 301,
        },
      }));

      // Step 4: Replace all items
      entries.forEach((e) => updateEntry(e.sourceUrl, { statusMessage: "⏳ Uploading redirects..." }));

      const replaceRes = await cfProxy({
        action: "replace-bulk-redirect-list-items",
        apiToken, accountId,
        data: { listId, items: allItems },
      });

      if (!(replaceRes as any).success) {
        const errMsg = (replaceRes as any).errors?.[0]?.message || "Failed to update list items";
        throw new Error(errMsg);
      }

      // Wait for operation to complete
      const opId = (replaceRes as any).operation_id;
      if (opId) {
        entries.forEach((e) => updateEntry(e.sourceUrl, { statusMessage: "⏳ Waiting for Cloudflare..." }));
        const completed = await waitForOperation(apiToken, accountId, opId);
        if (!completed) {
          entries.forEach((e) => updateEntry(e.sourceUrl, { statusMessage: "⚠️ Operation may still be processing" }));
        }
      }

      // Step 5: Ensure the bulk redirect rule exists
      entries.forEach((e) => updateEntry(e.sourceUrl, { statusMessage: "⏳ Enabling redirect rule..." }));

      const ruleRes = await cfProxy({
        action: "ensure-bulk-redirect-rule",
        apiToken, accountId,
        data: { listName, listId },
      });

      if (!(ruleRes as any).success) {
        console.error("Rule creation failed:", ruleRes);
      }

      // Step 6: Mark all as success and save to history
      for (const entry of entries) {
        updateEntry(entry.sourceUrl, { status: "success", statusMessage: "✅ Redirect deployed" });

        // Save to history
        if (user) {
          await supabase.from("redirect_history").upsert(
            {
              user_id: user.id,
              source_url: entry.sourceUrl,
              destination_url: entry.destinationUrl,
              domain: entry.domain,
              subdomain: entry.subdomain || null,
              redirect_type: "bulk_redirect",
              status_code: 301,
              cloudflare_account_id: authMode === "saved" ? selectedAccountId : null,
              cloudflare_list_id: listId,
              status: "active",
            },
            { onConflict: "id" }
          );
        }
      }
    } catch (err: any) {
      console.error("Deploy error:", err);
      entries.forEach((e) =>
        updateEntry(e.sourceUrl, { status: "error", statusMessage: `❌ ${err.message}` })
      );
    }

    setDeploying(false);
    setStep("done");
  }, [entries, getCredentials, listName, user, authMode, selectedAccountId]);

  // ─── Helpers ────────────────────────────────────────────────────────

  const removeEntry = (src: string) => setEntries((prev) => prev.filter((e) => e.sourceUrl !== src));
  const updateDest = (src: string, url: string) =>
    setEntries((prev) => prev.map((e) => (e.sourceUrl === src ? { ...e, destinationUrl: url } : e)));

  const successCount = entries.filter((e) => e.status === "success").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Bulk Redirects</h2>
        <p className="text-muted-foreground">
          Use Cloudflare Bulk Redirect API — supports up to 10,000 redirects on free plan
        </p>
      </div>

      {/* Step 1: Credentials */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Cloudflare Credentials
          </CardTitle>
          <CardDescription>
            Required permissions: <strong>Account Filter Lists Edit</strong> and <strong>Account Rulesets Write</strong>
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
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="Cloudflare API Token"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                disabled={tokenValid}
              />
              <Input
                placeholder="Cloudflare Account ID"
                value={manualAccountId}
                onChange={(e) => setManualAccountId(e.target.value)}
                disabled={tokenValid}
              />
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
              Enter domains or subdomains (one per line). Supports both full domains and subdomains.
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
              <div className="w-48">
                <label className="text-sm font-medium mb-1 block">List Name</label>
                <Input
                  placeholder="nextus_redirects"
                  value={listName}
                  onChange={(e) => setListName(e.target.value.replace(/[^a-z0-9_]/gi, "_"))}
                  disabled={step !== "input"}
                  className="font-mono text-sm"
                />
              </div>
              <Button onClick={handleParseInput} disabled={step !== "input"}>
                Review
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
              {entries.length} redirect{entries.length !== 1 ? "s" : ""} — list: <code className="text-xs">{listName}</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {entries.map((entry) => (
                <div key={entry.sourceUrl} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-border bg-card">
                  <span className="font-mono text-sm font-medium min-w-[200px]">{entry.sourceUrl}</span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground hidden sm:block" />
                  <Input
                    value={entry.destinationUrl}
                    onChange={(e) => updateDest(entry.sourceUrl, e.target.value)}
                    className="flex-1"
                    disabled={step !== "review"}
                  />
                  {step === "review" && (
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => removeEntry(entry.sourceUrl)}>
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
                  {deploying ? "Deploying..." : "Deploy Bulk Redirects"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

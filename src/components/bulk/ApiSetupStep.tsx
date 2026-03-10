import { useState, useEffect } from "react";
import { useBulkManager } from "@/hooks/useBulkManager";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Key, Shield, Loader2, ExternalLink, Save, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";

interface SavedAccount {
  id: string;
  account_name: string;
  cloudflare_email: string;
  api_key_encrypted: string;
  account_id: string | null;
}

export function ApiSetupStep() {
  const { state, dispatch } = useBulkManager();
  const { user } = useAuth();
  const [apiToken, setApiToken] = useState(state.apiToken);
  const [accountId, setAccountId] = useState(state.accountId);
  const [showToken, setShowToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [credentialName, setCredentialName] = useState("");
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const { toast } = useToast();

  // Load saved accounts on mount
  useEffect(() => {
    if (!user) return;
    const loadAccounts = async () => {
      const { data, error } = await supabase
        .from("cloudflare_accounts")
        .select("id, account_name, cloudflare_email, api_key_encrypted, account_id")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setSavedAccounts(data);
      }
      setLoadingAccounts(false);
    };
    loadAccounts();
  }, [user]);

  const loadSavedAccount = (account: SavedAccount) => {
    try {
      const decryptedKey = atob(account.api_key_encrypted);
      setApiToken(decryptedKey);
      setAccountId(account.account_id || "");
      setCredentialName(account.account_name);
      setSaveCredentials(false); // Already saved
      toast({ title: "Credentials loaded", description: `Loaded "${account.account_name}"` });
    } catch {
      toast({ title: "Error", description: "Could not decode saved credentials.", variant: "destructive" });
    }
  };

  const handleVerify = async () => {
    if (!apiToken.trim() || !accountId.trim()) {
      toast({ title: "Missing credentials", description: "Please enter both API token and Account ID.", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      dispatch({ type: "SET_CREDENTIALS", apiToken: apiToken.trim(), accountId: accountId.trim() });

      const { data: _, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", {
        body: { action: "verify-token", apiToken: apiToken.trim(), accountId: accountId.trim() },
      });

      if (error) throw new Error(error.message);

      // Save credentials if requested
      if (saveCredentials && credentialName.trim() && user) {
        const existing = savedAccounts.find(a => a.account_name === credentialName.trim());
        if (existing) {
          await supabase.from("cloudflare_accounts").update({
            api_key_encrypted: btoa(apiToken.trim()),
            account_id: accountId.trim(),
          }).eq("id", existing.id);
        } else {
          await supabase.from("cloudflare_accounts").insert({
            user_id: user.id,
            account_name: credentialName.trim(),
            cloudflare_email: "api-token@cloudflare",
            api_key_encrypted: btoa(apiToken.trim()),
            account_id: accountId.trim(),
          });
        }
      }

      toast({ title: "Credentials verified ✅", description: "Successfully connected to Cloudflare." });
      dispatch({ type: "SET_STEP", step: "domain-input" });
    } catch (err) {
      toast({
        title: "Verification failed",
        description: err instanceof Error ? err.message : "Could not connect to Cloudflare. Check your credentials.",
        variant: "destructive",
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
          <Key className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Connect to Cloudflare</h2>
        <p className="text-muted-foreground">
          Enter your credentials or select a saved account to get started.
        </p>
      </div>

      {/* Saved Accounts */}
      {!loadingAccounts && savedAccounts.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Save className="h-4 w-4 text-primary" />
              Saved Accounts
            </CardTitle>
            <CardDescription>Click to load saved credentials</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {savedAccounts.map((account) => (
              <button
                key={account.id}
                onClick={() => loadSavedAccount(account)}
                className="w-full text-left px-4 py-3 rounded-md border border-border hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between group"
              >
                <div>
                  <p className="font-medium text-sm">{account.account_name}</p>
                  <p className="text-xs text-muted-foreground">Account ID: {account.account_id || "N/A"}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground -rotate-90" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            API Credentials
          </CardTitle>
          <CardDescription>
            You'll need a Cloudflare API token with Zone:Edit permissions and your Account ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiToken">API Token</Label>
            <div className="relative">
              <Input
                id="apiToken"
                type={showToken ? "text" : "password"}
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="Your Cloudflare API Token"
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a token at{" "}
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                Cloudflare → Profile → API Tokens <ExternalLink className="h-3 w-3" />
              </a>
              {" "}with <strong>Zone:Read</strong> and <strong>Zone:Edit</strong> permissions.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountId">Account ID</Label>
            <Input
              id="accountId"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="32-character account ID"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Found in the right sidebar of any Cloudflare zone dashboard under "Account ID".
            </p>
          </div>

          {/* Save credentials option */}
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="saveCredentials"
                checked={saveCredentials}
                onCheckedChange={(checked) => setSaveCredentials(!!checked)}
              />
              <Label htmlFor="saveCredentials" className="text-sm font-normal cursor-pointer">
                Save credentials for next time
              </Label>
            </div>
            {saveCredentials && (
              <div className="space-y-1">
                <Label htmlFor="credentialName" className="text-xs">Account Label</Label>
                <Input
                  id="credentialName"
                  value={credentialName}
                  onChange={(e) => setCredentialName(e.target.value)}
                  placeholder='e.g. "My Main Account"'
                  className="text-sm"
                />
              </div>
            )}
          </div>

          <Button onClick={handleVerify} disabled={verifying || (saveCredentials && !credentialName.trim())} className="w-full">
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              "Verify & Continue"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

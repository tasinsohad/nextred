import { useState } from "react";
import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Key, Shield, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ApiSetupStep() {
  const { state, dispatch, cfProxy } = useBulkManager();
  const [apiToken, setApiToken] = useState(state.apiToken);
  const [accountId, setAccountId] = useState(state.accountId);
  const [showToken, setShowToken] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (!apiToken.trim() || !accountId.trim()) {
      toast({ title: "Missing credentials", description: "Please enter both API token and Account ID.", variant: "destructive" });
      return;
    }
    setVerifying(true);
    try {
      // Temporarily set credentials so cfProxy can use them
      dispatch({ type: "SET_CREDENTIALS", apiToken: apiToken.trim(), accountId: accountId.trim() });

      const { data: _, error } = await import("@/integrations/supabase/client").then(({ supabase }) =>
        supabase.functions.invoke("cloudflare-bulk-proxy", {
          body: { action: "verify-token", apiToken: apiToken.trim(), accountId: accountId.trim() },
        })
      );

      if (error) throw new Error(error.message);

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
          Enter your credentials to get started. They are never stored — only used for this session.
        </p>
      </div>

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

          <Alert className="border-warning/30 bg-warning/5">
            <Shield className="h-4 w-4 text-warning" />
            <AlertDescription className="text-xs">
              Credentials are only used in this browser session and never persisted to any database.
            </AlertDescription>
          </Alert>

          <Button onClick={handleVerify} disabled={verifying} className="w-full">
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

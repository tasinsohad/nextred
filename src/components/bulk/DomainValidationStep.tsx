import { useEffect, useState } from "react";
import { useBulkManager, ValidatedDomain } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function DomainValidationStep() {
  const { state, dispatch } = useBulkManager();
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState(0);

  const parseDomains = () =>
    state.rawDomains
      .split("\n")
      .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
      .filter((d) => d.length > 0 && d.includes("."));

  useEffect(() => {
    if (state.validatedDomains.length === 0) {
      runValidation();
    }
  }, []);

  const runValidation = async () => {
    setValidating(true);
    setProgress(0);

    const domains = parseDomains();

    // Initialize all as "checking"
    const initial: ValidatedDomain[] = domains.map((name) => ({
      name,
      zoneId: null,
      status: "checking",
      included: true,
    }));
    dispatch({ type: "SET_VALIDATED_DOMAINS", domains: initial });

    // Fetch all zones from Cloudflare once
    let zones: { id: string; name: string }[] = [];
    try {
      const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", {
        body: {
          action: "list-zones",
          apiToken: state.apiToken,
          accountId: state.accountId,
        },
      });
      if (!error && data?.success) {
        zones = data.zones ?? [];
      }
    } catch {
      // zones stays empty, all domains will be "not-found"
    }

    // Build a map for fast lookup
    const zoneMap = new Map<string, string>();
    for (const z of zones) {
      zoneMap.set(z.name.toLowerCase(), z.id);
    }

    // Validate each domain
    const validated: ValidatedDomain[] = domains.map((name, i) => {
      const zoneId = zoneMap.get(name) ?? null;
      setProgress(Math.round(((i + 1) / domains.length) * 100));
      return {
        name,
        zoneId,
        status: zoneId ? "found" : "not-found",
        included: !!zoneId,
      };
    });

    dispatch({ type: "SET_VALIDATED_DOMAINS", domains: validated });
    setValidating(false);
    setProgress(100);
  };

  const domains = state.validatedDomains;
  const found = domains.filter((d) => d.status === "found").length;
  const notFound = domains.filter((d) => d.status === "not-found").length;
  const included = domains.filter((d) => d.included).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Domain Validation</h2>
        <p className="text-muted-foreground">
          Checking which domains exist in your Cloudflare account.
        </p>
      </div>

      {validating && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              Fetching zones from Cloudflare…
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {!validating && domains.length > 0 && (
        <>
          <div className="flex gap-3 flex-wrap">
            <Badge variant="secondary" className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              {found} found
            </Badge>
            {notFound > 0 && (
              <Badge variant="secondary" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5 text-destructive" />
                {notFound} not found
              </Badge>
            )}
            <Badge variant="secondary">{included} selected for operation</Badge>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Results</CardTitle>
              <CardDescription>
                Uncheck domains you want to exclude. Only ✅ found domains can be included.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {domains.map((d) => (
                  <div
                    key={d.name}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card"
                  >
                    {d.status === "found" ? (
                      <Checkbox
                        id={d.name}
                        checked={d.included}
                        onCheckedChange={() => dispatch({ type: "TOGGLE_DOMAIN_INCLUDED", domainName: d.name })}
                      />
                    ) : (
                      <div className="h-4 w-4" />
                    )}
                    <label
                      htmlFor={d.status === "found" ? d.name : undefined}
                      className="flex-1 text-sm font-mono cursor-pointer"
                    >
                      {d.name}
                    </label>
                    {d.status === "found" ? (
                      <span className="flex items-center gap-1 text-xs text-success font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Found
                      </span>
                    ) : d.status === "not-found" ? (
                      <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                        <XCircle className="h-3.5 w-3.5" /> Not in account
                      </span>
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "SET_STEP", step: "domain-input" })}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button variant="outline" onClick={runValidation} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Re-check
            </Button>
            <Button
              className="flex-1 gap-2"
              disabled={included === 0}
              onClick={() => dispatch({ type: "SET_STEP", step: "mode-selection" })}
            >
              Continue with {included} domain{included !== 1 ? "s" : ""}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

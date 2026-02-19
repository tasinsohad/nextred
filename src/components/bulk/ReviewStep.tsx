import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, ArrowRight, Globe, Link, Server } from "lucide-react";

export function ReviewStep() {
  const { state, dispatch, includedDomains } = useBulkManager();

  const getRedirectTarget = (domain: string) => {
    if (state.redirectSameForAll) return state.redirectTargetUrl;
    return state.customRedirects.find((r) => r.domain === domain)?.targetUrl ?? "—";
  };

  const getDnsRecords = (domain: string) => {
    if (state.dnsSameForAll) return state.defaultDnsRecords;
    return (
      state.domainDnsOverrides.find((o) => o.domain === domain)?.records ?? state.defaultDnsRecords
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Review Changes</h2>
        <p className="text-muted-foreground">
          Please review all changes carefully before executing. This cannot be undone automatically.
        </p>
      </div>

      {/* Summary header */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <span className="font-semibold">{includedDomains.length} domain{includedDomains.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-2">
              {state.mode === "redirects" ? (
                <Link className="h-4 w-4 text-primary" />
              ) : (
                <Server className="h-4 w-4 text-primary" />
              )}
              <span className="font-semibold">
                {state.mode === "redirects"
                  ? `${state.redirectType} Redirect${state.redirectSameForAll ? " (same for all)" : " (per domain)"}`
                  : `DNS Records${state.dnsSameForAll ? " (same for all)" : " (per domain)"}`}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-domain details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Changes per Domain</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {includedDomains.map((d) => (
              <div key={d.name} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-semibold">{d.name}</span>
                </div>

                {state.mode === "redirects" && (
                  <div className="flex items-start gap-2 text-sm">
                    <ArrowRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                    <div>
                      <span className="text-muted-foreground mr-2">Redirect to:</span>
                      <code className="text-foreground bg-muted px-1.5 py-0.5 rounded text-xs">
                        {getRedirectTarget(d.name)}
                      </code>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {state.redirectType}
                      </Badge>
                    </div>
                  </div>
                )}

                {state.mode === "dns" && (
                  <div className="space-y-1.5">
                    {getDnsRecords(d.name).map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono">
                        <Badge variant="secondary" className="text-xs">{r.type}</Badge>
                        <span className="text-muted-foreground">{r.name}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate">{r.content}</span>
                        <span className="text-muted-foreground ml-auto">TTL:{r.ttl}</span>
                        {r.proxied && <Badge variant="outline" className="text-xs">☁️</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() =>
            dispatch({
              type: "SET_STEP",
              step: state.mode === "redirects" ? "redirect-config" : "dns-config",
            })
          }
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          className="flex-1 gap-2 bg-primary"
          onClick={() => dispatch({ type: "SET_STEP", step: "execution" })}
        >
          <Play className="h-4 w-4" />
          Execute {includedDomains.length} Change{includedDomains.length !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

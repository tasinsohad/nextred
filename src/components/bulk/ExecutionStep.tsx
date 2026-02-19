import { useEffect, useRef } from "react";
import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function ExecutionStep() {
  const { state, dispatch, includedDomains } = useBulkManager();
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runExecution();
  }, []);

  const cfCall = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", {
      body: { ...body, apiToken: state.apiToken, accountId: state.accountId },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const runExecution = async () => {
    // Initialize logs
    for (const d of includedDomains) {
      dispatch({
        type: "ADD_EXECUTION_LOG",
        log: { domain: d.name, message: "Queued…", status: "pending" },
      });
    }

    for (const d of includedDomains) {
      dispatch({
        type: "UPDATE_EXECUTION_LOG",
        domain: d.name,
        update: { status: "running", message: "Processing…" },
      });

      try {
        if (state.mode === "redirects") {
          const targetUrl = state.redirectSameForAll
            ? state.redirectTargetUrl
            : state.customRedirects.find((r) => r.domain === d.name)?.targetUrl ?? "";

          await cfCall({
            action: "create-redirect-ruleset",
            zoneId: d.zoneId,
            data: {
              targetUrl,
              redirectType: state.redirectType,
              domainName: d.name,
            },
          });

          dispatch({
            type: "UPDATE_EXECUTION_LOG",
            domain: d.name,
            update: {
              status: "success",
              message: `✅ ${state.redirectType} redirect → ${targetUrl}`,
            },
          });
        } else if (state.mode === "dns") {
          const records = state.dnsSameForAll
            ? state.defaultDnsRecords
            : state.domainDnsOverrides.find((o) => o.domain === d.name)?.records ??
              state.defaultDnsRecords;

          for (const record of records) {
            dispatch({
              type: "UPDATE_EXECUTION_LOG",
              domain: d.name,
              update: { message: `Creating ${record.type} record "${record.name}"…` },
            });

            const result = await cfCall({
              action: "create-dns-record",
              zoneId: d.zoneId,
              data: {
                type: record.type,
                name: record.name,
                content: record.content,
                ttl: record.ttl,
                proxied: record.proxied,
                ...(record.priority !== undefined ? { priority: record.priority } : {}),
              },
            });

            if (!result.success) {
              const errMsg = (result.errors as Array<{ message: string }>)?.[0]?.message ?? "Unknown error";
              throw new Error(errMsg);
            }

            await sleep(200); // small delay between records
          }

          dispatch({
            type: "UPDATE_EXECUTION_LOG",
            domain: d.name,
            update: {
              status: "success",
              message: `✅ ${records.length} record${records.length !== 1 ? "s" : ""} created`,
            },
          });
        }
      } catch (err) {
        dispatch({
          type: "UPDATE_EXECUTION_LOG",
          domain: d.name,
          update: {
            status: "error",
            message: "❌ Failed",
            error: err instanceof Error ? err.message : "Unknown error",
          },
        });
      }

      // Rate limit protection: 300ms between domains
      await sleep(300);
    }

    dispatch({ type: "SET_EXECUTION_DONE" });
  };

  const done = state.executionLogs.filter((l) => l.status === "success" || l.status === "error").length;
  const total = includedDomains.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">
          {state.executionDone ? "Execution Complete" : "Executing Changes…"}
        </h2>
        <p className="text-muted-foreground">
          {state.executionDone
            ? `Processed ${done} of ${total} domain${total !== 1 ? "s" : ""}.`
            : "Please wait while changes are applied sequentially."}
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{done} / {total} domains</span>
            <span className="font-semibold">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Progress Log</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1 font-mono text-sm">
            {state.executionLogs.map((log) => (
              <div
                key={log.domain}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg border bg-muted/20"
              >
                <div className="flex-shrink-0 mt-0.5">
                  {log.status === "success" && <CheckCircle2 className="h-4 w-4 text-success" />}
                  {log.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                  {log.status === "running" && <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                  {log.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs">{log.domain}</span>
                    {log.status !== "pending" && log.status !== "running" && (
                      <Badge
                        variant={log.status === "success" ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {log.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{log.message}</p>
                  {log.error && (
                    <p className="text-xs text-destructive mt-0.5">{log.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {state.executionDone && (
        <Button
          className="w-full gap-2"
          onClick={() => dispatch({ type: "SET_STEP", step: "summary" })}
        >
          View Final Summary
          <ArrowRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

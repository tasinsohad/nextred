import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw, Trophy } from "lucide-react";

export function SummaryStep() {
  const { state, dispatch } = useBulkManager();

  const successful = state.executionLogs.filter((l) => l.status === "success");
  const failed = state.executionLogs.filter((l) => l.status === "error");
  const total = state.executionLogs.length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
          <Trophy className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Operation Complete</h2>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <span className="font-semibold text-success">{successful.length} succeeded</span>
          </div>
          {failed.length > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <span className="font-semibold text-destructive">{failed.length} failed</span>
            </div>
          )}
          <span className="text-muted-foreground text-sm">({total} total)</span>
        </div>
      </div>

      {/* Success rate bar */}
      <div className="h-3 rounded-full overflow-hidden bg-muted flex">
        <div
          className="bg-success transition-all"
          style={{ width: `${total > 0 ? (successful.length / total) * 100 : 0}%` }}
        />
        <div
          className="bg-destructive transition-all"
          style={{ width: `${total > 0 ? (failed.length / total) * 100 : 0}%` }}
        />
      </div>

      {successful.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Successful ({successful.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {successful.map((l) => (
                <div key={l.domain} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-success/5 border border-success/20">
                  <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-mono font-semibold">{l.domain}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{l.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {failed.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              Failed ({failed.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {failed.map((l) => (
                <div key={l.domain} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20">
                  <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-mono font-semibold">{l.domain}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{l.message}</p>
                    {l.error && (
                      <p className="text-xs text-destructive mt-1 font-mono">{l.error}</p>
                    )}
                    <Badge variant="outline" className="text-xs mt-1">Manual action required</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => dispatch({ type: "RESET" })}
      >
        <RefreshCw className="h-4 w-4" />
        Start New Operation
      </Button>
    </div>
  );
}

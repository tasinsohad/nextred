import { useState } from "react";
import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Globe, ArrowLeft } from "lucide-react";

export function DomainInputStep() {
  const { state, dispatch } = useBulkManager();
  const [value, setValue] = useState(state.rawDomains);

  const parsedCount = value
    .split("\n")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0 && d.includes(".")).length;

  const handleContinue = () => {
    dispatch({ type: "SET_RAW_DOMAINS", rawDomains: value });
    dispatch({ type: "SET_STEP", step: "domain-validation" });
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
          <Globe className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Enter Domains</h2>
        <p className="text-muted-foreground">
          Paste the domains you want to manage — one per line.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Domain List</CardTitle>
          <CardDescription>
            Enter each domain on a new line. Subdomains and paths are not needed — just the root domain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="domains">Domains</Label>
            <Textarea
              id="domains"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={"company1.com\ncompany2.com\ncompany3.com"}
              rows={10}
              className="font-mono text-sm resize-none"
            />
            {parsedCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {parsedCount} domain{parsedCount !== 1 ? "s" : ""} detected
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => dispatch({ type: "SET_STEP", step: "api-setup" })}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleContinue}
              disabled={parsedCount === 0}
              className="flex-1"
            >
              Validate {parsedCount > 0 ? `${parsedCount} Domain${parsedCount !== 1 ? "s" : ""}` : "Domains"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

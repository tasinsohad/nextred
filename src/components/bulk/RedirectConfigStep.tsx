import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Link } from "lucide-react";

export function RedirectConfigStep() {
  const { state, dispatch, includedDomains } = useBulkManager();

  const getCustomUrl = (domain: string) =>
    state.customRedirects.find((r) => r.domain === domain)?.targetUrl ?? "";

  const allCustomFilled = includedDomains.every((d) => getCustomUrl(d.name).trim().length > 0);
  const canContinue = state.redirectSameForAll
    ? state.redirectTargetUrl.trim().length > 0
    : allCustomFilled;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
          <Link className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Configure Redirects</h2>
        <p className="text-muted-foreground">
          Set the redirect targets for {includedDomains.length} domain{includedDomains.length !== 1 ? "s" : ""}.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Redirect Type</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={state.redirectType}
            onValueChange={(v) => dispatch({ type: "SET_REDIRECT_TYPE", value: v as "301" | "302" })}
            className="flex gap-6"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="301" id="r301" />
              <Label htmlFor="r301" className="cursor-pointer font-medium">
                301 — Permanent redirect
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="302" id="r302" />
              <Label htmlFor="r302" className="cursor-pointer font-medium">
                302 — Temporary redirect
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Target URL</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={state.redirectSameForAll ? "same" : "custom"}
            onValueChange={(v) => dispatch({ type: "SET_REDIRECT_SAME_FOR_ALL", value: v === "same" })}
          >
            <TabsList className="w-full">
              <TabsTrigger value="same" className="flex-1">Same for all domains</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">Custom per domain</TabsTrigger>
            </TabsList>
          </Tabs>

          {state.redirectSameForAll ? (
            <div className="space-y-2">
              <Label htmlFor="globalTarget">Target URL (all domains)</Label>
              <Input
                id="globalTarget"
                type="url"
                value={state.redirectTargetUrl}
                onChange={(e) => dispatch({ type: "SET_REDIRECT_TARGET", url: e.target.value })}
                placeholder="https://your-target.com"
              />
              <p className="text-xs text-muted-foreground">
                All selected domains will redirect to this URL with a {state.redirectType} status code.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {includedDomains.map((d) => (
                <div key={d.name} className="space-y-1.5">
                  <Label className="font-mono text-xs text-muted-foreground">{d.name}</Label>
                  <Input
                    type="url"
                    value={getCustomUrl(d.name)}
                    onChange={(e) =>
                      dispatch({ type: "SET_CUSTOM_REDIRECT", domain: d.name, targetUrl: e.target.value })
                    }
                    placeholder={`https://target-for-${d.name}`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "SET_STEP", step: "mode-selection" })}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button
          className="flex-1"
          disabled={!canContinue}
          onClick={() => dispatch({ type: "SET_STEP", step: "review" })}
        >
          Review Changes
        </Button>
      </div>
    </div>
  );
}

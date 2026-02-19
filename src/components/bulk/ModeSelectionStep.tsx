import { useBulkManager } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Link, Server } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  selected: boolean;
  onClick: () => void;
}

function ModeCard({ icon, title, description, bullets, selected, onClick }: ModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border-2 p-6 transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card hover:border-primary/40"
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-lg",
            selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </div>
        <div className="space-y-1.5">
          <h3 className="font-semibold text-base">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
          <ul className="space-y-1 pt-1">
            {bullets.map((b) => (
              <li key={b} className="text-sm flex items-start gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </button>
  );
}

export function ModeSelectionStep() {
  const { state, dispatch, includedDomains } = useBulkManager();

  const handleContinue = () => {
    if (state.mode === "redirects") dispatch({ type: "SET_STEP", step: "redirect-config" });
    else if (state.mode === "dns") dispatch({ type: "SET_STEP", step: "dns-config" });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Choose Operation Mode</h2>
        <p className="text-muted-foreground">
          What would you like to do across{" "}
          <strong>{includedDomains.length} domain{includedDomains.length !== 1 ? "s" : ""}</strong>?
        </p>
      </div>

      <div className="space-y-4">
        <ModeCard
          icon={<Link className="h-5 w-5" />}
          title="Mode 1 — Change Redirects"
          description="Set up URL redirects for all selected domains."
          bullets={[
            "301 Permanent or 302 Temporary redirects",
            "Same target for all domains, or custom per domain",
            "Applied via Cloudflare Redirect Rules",
          ]}
          selected={state.mode === "redirects"}
          onClick={() => dispatch({ type: "SET_MODE", mode: "redirects" })}
        />

        <ModeCard
          icon={<Server className="h-5 w-5" />}
          title="Mode 2 — Change DNS Records"
          description="Add or update DNS records across all selected domains."
          bullets={[
            "Supports A, CNAME, MX, TXT, AAAA, NS records",
            "Same records for all domains, or custom per domain",
            "Choose TTL and proxy status per record",
          ]}
          selected={state.mode === "dns"}
          onClick={() => dispatch({ type: "SET_MODE", mode: "dns" })}
        />
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => dispatch({ type: "SET_STEP", step: "domain-validation" })}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleContinue} disabled={!state.mode} className="flex-1">
          Configure {state.mode === "redirects" ? "Redirects" : state.mode === "dns" ? "DNS Records" : "…"}
        </Button>
      </div>
    </div>
  );
}

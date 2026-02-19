import { BulkManagerProvider, useBulkManager } from "@/hooks/useBulkManager";
import { ApiSetupStep } from "@/components/bulk/ApiSetupStep";
import { DomainInputStep } from "@/components/bulk/DomainInputStep";
import { DomainValidationStep } from "@/components/bulk/DomainValidationStep";
import { ModeSelectionStep } from "@/components/bulk/ModeSelectionStep";
import { RedirectConfigStep } from "@/components/bulk/RedirectConfigStep";
import { DnsConfigStep } from "@/components/bulk/DnsConfigStep";
import { ReviewStep } from "@/components/bulk/ReviewStep";
import { ExecutionStep } from "@/components/bulk/ExecutionStep";
import { SummaryStep } from "@/components/bulk/SummaryStep";
import { cn } from "@/lib/utils";
import { CloudCog } from "lucide-react";

const STEPS = [
  { key: "api-setup", label: "Connect" },
  { key: "domain-input", label: "Domains" },
  { key: "domain-validation", label: "Validate" },
  { key: "mode-selection", label: "Mode" },
  { key: "redirect-config", label: "Config" },
  { key: "dns-config", label: "Config" },
  { key: "review", label: "Review" },
  { key: "execution", label: "Execute" },
  { key: "summary", label: "Done" },
] as const;

// Visible steps for progress indicator (excluding mode-specific config duplicates)
const PROGRESS_STEPS = [
  { keys: ["api-setup"], label: "Connect" },
  { keys: ["domain-input"], label: "Domains" },
  { keys: ["domain-validation"], label: "Validate" },
  { keys: ["mode-selection"], label: "Mode" },
  { keys: ["redirect-config", "dns-config"], label: "Configure" },
  { keys: ["review"], label: "Review" },
  { keys: ["execution"], label: "Execute" },
  { keys: ["summary"], label: "Done" },
];

function ProgressBar() {
  const { state } = useBulkManager();
  const currentIdx = PROGRESS_STEPS.findIndex((s) => s.keys.includes(state.step));

  return (
    <div className="flex items-center gap-0 justify-center mb-8">
      {PROGRESS_STEPS.map((s, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <div key={s.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all",
                  isDone
                    ? "bg-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs mt-1 hidden sm:block",
                  isActive ? "text-foreground font-medium" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < PROGRESS_STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-8 sm:w-12 mx-1 transition-all",
                  isDone ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function WizardContent() {
  const { state } = useBulkManager();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary text-primary-foreground">
            <CloudCog className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight">Cloudflare Bulk Manager</h1>
            <p className="text-xs text-muted-foreground">DNS Records & Redirect Manager</p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <ProgressBar />

        <div className="animate-in fade-in-0 duration-200">
          {state.step === "api-setup" && <ApiSetupStep />}
          {state.step === "domain-input" && <DomainInputStep />}
          {state.step === "domain-validation" && <DomainValidationStep />}
          {state.step === "mode-selection" && <ModeSelectionStep />}
          {state.step === "redirect-config" && <RedirectConfigStep />}
          {state.step === "dns-config" && <DnsConfigStep />}
          {state.step === "review" && <ReviewStep />}
          {state.step === "execution" && <ExecutionStep />}
          {state.step === "summary" && <SummaryStep />}
        </div>
      </main>
    </div>
  );
}

export default function BulkManager() {
  return (
    <BulkManagerProvider>
      <WizardContent />
    </BulkManagerProvider>
  );
}

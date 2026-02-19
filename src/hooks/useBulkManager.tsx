import { createContext, useContext, useReducer, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WizardStep =
  | "api-setup"
  | "domain-input"
  | "domain-validation"
  | "mode-selection"
  | "redirect-config"
  | "dns-config"
  | "review"
  | "execution"
  | "summary";

export interface ValidatedDomain {
  name: string;
  zoneId: string | null;
  status: "found" | "not-found" | "checking";
  included: boolean;
}

export interface RedirectTarget {
  domain: string;
  targetUrl: string;
}

export interface DnsRecord {
  type: "A" | "CNAME" | "MX" | "TXT" | "AAAA" | "NS" | "SRV";
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  priority?: number;
}

export interface DomainDnsOverride {
  domain: string;
  records: DnsRecord[];
}

export interface ExecutionLog {
  domain: string;
  message: string;
  status: "pending" | "running" | "success" | "error";
  error?: string;
}

export interface BulkManagerState {
  step: WizardStep;
  apiToken: string;
  accountId: string;
  rawDomains: string;
  validatedDomains: ValidatedDomain[];
  mode: "redirects" | "dns" | null;
  // Redirect config
  redirectSameForAll: boolean;
  redirectTargetUrl: string;
  redirectType: "301" | "302";
  customRedirects: RedirectTarget[];
  // DNS config
  dnsSameForAll: boolean;
  defaultDnsRecords: DnsRecord[];
  domainDnsOverrides: DomainDnsOverride[];
  // Execution
  executionLogs: ExecutionLog[];
  executionDone: boolean;
}

type Action =
  | { type: "SET_CREDENTIALS"; apiToken: string; accountId: string }
  | { type: "SET_RAW_DOMAINS"; rawDomains: string }
  | { type: "SET_VALIDATED_DOMAINS"; domains: ValidatedDomain[] }
  | { type: "TOGGLE_DOMAIN_INCLUDED"; domainName: string }
  | { type: "SET_STEP"; step: WizardStep }
  | { type: "SET_MODE"; mode: "redirects" | "dns" }
  | { type: "SET_REDIRECT_SAME_FOR_ALL"; value: boolean }
  | { type: "SET_REDIRECT_TARGET"; url: string }
  | { type: "SET_REDIRECT_TYPE"; value: "301" | "302" }
  | { type: "SET_CUSTOM_REDIRECT"; domain: string; targetUrl: string }
  | { type: "SET_DNS_SAME_FOR_ALL"; value: boolean }
  | { type: "SET_DEFAULT_DNS_RECORDS"; records: DnsRecord[] }
  | { type: "SET_DOMAIN_DNS_OVERRIDE"; domain: string; records: DnsRecord[] }
  | { type: "ADD_EXECUTION_LOG"; log: ExecutionLog }
  | { type: "UPDATE_EXECUTION_LOG"; domain: string; update: Partial<ExecutionLog> }
  | { type: "SET_EXECUTION_DONE" }
  | { type: "RESET" };

function initialState(): BulkManagerState {
  return {
    step: "api-setup",
    apiToken: "",
    accountId: "",
    rawDomains: "",
    validatedDomains: [],
    mode: null,
    redirectSameForAll: true,
    redirectTargetUrl: "",
    redirectType: "301",
    customRedirects: [],
    dnsSameForAll: true,
    defaultDnsRecords: [],
    domainDnsOverrides: [],
    executionLogs: [],
    executionDone: false,
  };
}

function reducer(state: BulkManagerState, action: Action): BulkManagerState {
  switch (action.type) {
    case "SET_CREDENTIALS":
      return { ...state, apiToken: action.apiToken, accountId: action.accountId };
    case "SET_RAW_DOMAINS":
      return { ...state, rawDomains: action.rawDomains };
    case "SET_VALIDATED_DOMAINS":
      return { ...state, validatedDomains: action.domains };
    case "TOGGLE_DOMAIN_INCLUDED":
      return {
        ...state,
        validatedDomains: state.validatedDomains.map((d) =>
          d.name === action.domainName ? { ...d, included: !d.included } : d
        ),
      };
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_MODE":
      return { ...state, mode: action.mode };
    case "SET_REDIRECT_SAME_FOR_ALL":
      return { ...state, redirectSameForAll: action.value };
    case "SET_REDIRECT_TARGET":
      return { ...state, redirectTargetUrl: action.url };
    case "SET_REDIRECT_TYPE":
      return { ...state, redirectType: action.value };
    case "SET_CUSTOM_REDIRECT":
      return {
        ...state,
        customRedirects: state.customRedirects.some((r) => r.domain === action.domain)
          ? state.customRedirects.map((r) =>
              r.domain === action.domain ? { ...r, targetUrl: action.targetUrl } : r
            )
          : [...state.customRedirects, { domain: action.domain, targetUrl: action.targetUrl }],
      };
    case "SET_DNS_SAME_FOR_ALL":
      return { ...state, dnsSameForAll: action.value };
    case "SET_DEFAULT_DNS_RECORDS":
      return { ...state, defaultDnsRecords: action.records };
    case "SET_DOMAIN_DNS_OVERRIDE":
      return {
        ...state,
        domainDnsOverrides: state.domainDnsOverrides.some((o) => o.domain === action.domain)
          ? state.domainDnsOverrides.map((o) =>
              o.domain === action.domain ? { ...o, records: action.records } : o
            )
          : [...state.domainDnsOverrides, { domain: action.domain, records: action.records }],
      };
    case "ADD_EXECUTION_LOG":
      return { ...state, executionLogs: [...state.executionLogs, action.log] };
    case "UPDATE_EXECUTION_LOG":
      return {
        ...state,
        executionLogs: state.executionLogs.map((l) =>
          l.domain === action.domain ? { ...l, ...action.update } : l
        ),
      };
    case "SET_EXECUTION_DONE":
      return { ...state, executionDone: true };
    case "RESET":
      return initialState();
    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface BulkManagerContextValue {
  state: BulkManagerState;
  dispatch: React.Dispatch<Action>;
  cfProxy: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  includedDomains: ValidatedDomain[];
}

const BulkManagerContext = createContext<BulkManagerContextValue | null>(null);

export function BulkManagerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState());

  const cfProxy = async (params: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const { data, error } = await supabase.functions.invoke("cloudflare-bulk-proxy", {
      body: { ...params, apiToken: state.apiToken, accountId: state.accountId },
    });
    if (error) throw new Error(error.message);
    return data;
  };

  const includedDomains = state.validatedDomains.filter(
    (d) => d.status === "found" && d.included
  );

  return (
    <BulkManagerContext.Provider value={{ state, dispatch, cfProxy, includedDomains }}>
      {children}
    </BulkManagerContext.Provider>
  );
}

export function useBulkManager() {
  const ctx = useContext(BulkManagerContext);
  if (!ctx) throw new Error("useBulkManager must be used within BulkManagerProvider");
  return ctx;
}

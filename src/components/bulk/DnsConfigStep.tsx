import { useState } from "react";
import { useBulkManager, DnsRecord } from "@/hooks/useBulkManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, Server } from "lucide-react";

const DNS_TYPES: DnsRecord["type"][] = ["A", "CNAME", "MX", "TXT", "AAAA", "NS"];

function emptyRecord(): DnsRecord {
  return { type: "A", name: "@", content: "", ttl: 3600, proxied: false };
}

interface RecordEditorProps {
  records: DnsRecord[];
  onChange: (records: DnsRecord[]) => void;
}

function RecordEditor({ records, onChange }: RecordEditorProps) {
  const update = (i: number, patch: Partial<DnsRecord>) => {
    const next = records.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange(next);
  };
  const remove = (i: number) => onChange(records.filter((_, idx) => idx !== i));
  const add = () => onChange([...records, emptyRecord()]);

  return (
    <div className="space-y-3">
      {records.map((r, i) => (
        <div key={i} className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={r.type} onValueChange={(v) => update(i, { type: v as DnsRecord["type"] })}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DNS_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              className="w-32 font-mono text-sm"
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Name (@, www…)"
            />

            <Input
              className="flex-1 min-w-32 font-mono text-sm"
              value={r.content}
              onChange={(e) => update(i, { content: e.target.value })}
              placeholder={r.type === "A" ? "1.2.3.4" : r.type === "CNAME" ? "target.example.com" : "Value"}
            />

            <Input
              className="w-24 font-mono text-sm"
              type="number"
              value={r.ttl}
              onChange={(e) => update(i, { ttl: parseInt(e.target.value) || 3600 })}
              placeholder="TTL"
            />

            {(r.type === "A" || r.type === "CNAME" || r.type === "AAAA") && (
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={r.proxied}
                  onCheckedChange={(v) => update(i, { proxied: v })}
                  id={`proxy-${i}`}
                />
                <Label htmlFor={`proxy-${i}`} className="text-xs cursor-pointer">Proxied</Label>
              </div>
            )}

            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="font-mono">{r.type}</Badge>
            <span>{r.name}</span>
            <span>→</span>
            <span className="truncate font-mono">{r.content || "…"}</span>
            {r.proxied && <Badge variant="secondary" className="text-xs">☁️ Proxied</Badge>}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} className="gap-2 w-full">
        <Plus className="h-4 w-4" />
        Add Record
      </Button>
    </div>
  );
}

export function DnsConfigStep() {
  const { state, dispatch, includedDomains } = useBulkManager();
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const getOverrideRecords = (domain: string) =>
    state.domainDnsOverrides.find((o) => o.domain === domain)?.records ?? [...state.defaultDnsRecords];

  const canContinue = state.dnsSameForAll
    ? state.defaultDnsRecords.length > 0 && state.defaultDnsRecords.every((r) => r.content.trim())
    : includedDomains.every((d) => {
        const recs = getOverrideRecords(d.name);
        return recs.length > 0 && recs.every((r) => r.content.trim());
      });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
          <Server className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold">Configure DNS Records</h2>
        <p className="text-muted-foreground">
          Define the records to add/update across {includedDomains.length} domain{includedDomains.length !== 1 ? "s" : ""}.
        </p>
      </div>

      <Tabs
        value={state.dnsSameForAll ? "same" : "custom"}
        onValueChange={(v) => dispatch({ type: "SET_DNS_SAME_FOR_ALL", value: v === "same" })}
      >
        <TabsList className="w-full">
          <TabsTrigger value="same" className="flex-1">Same records for all</TabsTrigger>
          <TabsTrigger value="custom" className="flex-1">Custom per domain</TabsTrigger>
        </TabsList>
      </Tabs>

      {state.dnsSameForAll ? (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">DNS Records (applied to all domains)</CardTitle>
          </CardHeader>
          <CardContent>
            <RecordEditor
              records={state.defaultDnsRecords}
              onChange={(records) => dispatch({ type: "SET_DEFAULT_DNS_RECORDS", records })}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            {includedDomains.map((d) => {
              const override = state.domainDnsOverrides.find((o) => o.domain === d.name);
              return (
                <button
                  key={d.name}
                  onClick={() => setSelectedDomain(d.name === selectedDomain ? null : d.name)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-mono transition-all ${
                    selectedDomain === d.name
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:border-primary/50"
                  }`}
                >
                  {d.name}
                  {override && <span className="ml-1.5 text-xs text-primary">({override.records.length})</span>}
                </button>
              );
            })}
          </div>

          {selectedDomain && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-mono text-sm">{selectedDomain}</CardTitle>
              </CardHeader>
              <CardContent>
                <RecordEditor
                  records={getOverrideRecords(selectedDomain)}
                  onChange={(records) =>
                    dispatch({ type: "SET_DOMAIN_DNS_OVERRIDE", domain: selectedDomain, records })
                  }
                />
              </CardContent>
            </Card>
          )}

          {!selectedDomain && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Select a domain above to configure its DNS records.
            </p>
          )}
        </div>
      )}

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

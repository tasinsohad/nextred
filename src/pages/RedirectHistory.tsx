import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, ExternalLink, Pencil, Check, X, Trash2, Loader2, History } from "lucide-react";
import { format } from "date-fns";

interface RedirectRecord {
  id: string;
  source_url: string;
  destination_url: string;
  domain: string;
  subdomain: string | null;
  redirect_type: string;
  status_code: number;
  status: string;
  cloudflare_list_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function RedirectHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [records, setRecords] = useState<RedirectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchHistory = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("redirect_history")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading history", description: error.message, variant: "destructive" });
    } else {
      setRecords((data as RedirectRecord[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, [user]);

  const filtered = records.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.source_url.toLowerCase().includes(q) ||
      r.destination_url.toLowerCase().includes(q) ||
      r.domain.toLowerCase().includes(q) ||
      (r.subdomain?.toLowerCase().includes(q) ?? false)
    );
  });

  const handleEdit = (record: RedirectRecord) => {
    setEditingId(record.id);
    setEditUrl(record.destination_url);
  };

  const handleSave = async (id: string) => {
    setSaving(true);
    const { error } = await supabase
      .from("redirect_history")
      .update({ destination_url: editUrl })
      .eq("id", id);

    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Redirect updated" });
      setEditingId(null);
      fetchHistory();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("redirect_history")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error deleting", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Record deleted" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Redirect History
        </h2>
        <p className="text-muted-foreground">
          View, search, and edit your redirect configurations
        </p>
      </div>

      {/* Search */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by domain, subdomain, source or destination URL..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {search ? `Results for "${search}"` : "All Redirects"}
          </CardTitle>
          <CardDescription>
            {filtered.length} redirect{filtered.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground animate-pulse">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search ? "No redirects match your search." : "No redirect history yet. Deploy some redirects first."}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((record) => (
                <div key={record.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 rounded-lg border border-border bg-card">
                  <div className="min-w-[200px]">
                    <p className="font-mono text-sm font-medium">{record.source_url}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {record.redirect_type === "bulk_redirect" ? "Bulk" : record.redirect_type === "page_rule" ? "Page Rule" : record.redirect_type}
                      </Badge>
                      <Badge variant={record.status === "active" ? "default" : "secondary"} className="text-xs">
                        {record.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(record.updated_at), "MMM d, yyyy")}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 flex items-center gap-2">
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    {editingId === record.id ? (
                      <Input
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="flex-1"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm text-muted-foreground truncate">{record.destination_url}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {editingId === record.id ? (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => handleSave(record.id)} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-600" />}
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => handleEdit(record)}>
                          <Pencil className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(record.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

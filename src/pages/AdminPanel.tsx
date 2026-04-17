import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Settings2, Shield } from 'lucide-react';

interface UserRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  workspace_name: string | null;
  is_active: boolean;
  months_granted: number;
  expires_at: string | null;
  monthly_redirect_limit: number;
  monthly_dns_limit: number;
  notes: string | null;
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    is_active: false,
    months_granted: 1,
    monthly_redirect_limit: 100,
    monthly_dns_limit: 50,
    notes: '',
  });

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, email, full_name, workspace_name')
      .order('created_at', { ascending: false });

    const { data: subs } = await supabase
      .from('user_subscriptions')
      .select('*');

    const subMap = new Map((subs || []).map((s) => [s.user_id, s]));
    const merged: UserRow[] = (profiles || []).map((p) => {
      const s = subMap.get(p.user_id);
      return {
        user_id: p.user_id,
        email: p.email,
        full_name: p.full_name,
        workspace_name: p.workspace_name,
        is_active: s?.is_active ?? false,
        months_granted: s?.months_granted ?? 0,
        expires_at: s?.expires_at ?? null,
        monthly_redirect_limit: s?.monthly_redirect_limit ?? 0,
        monthly_dns_limit: s?.monthly_dns_limit ?? 0,
        notes: s?.notes ?? null,
      };
    });
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setForm({
      is_active: u.is_active,
      months_granted: u.months_granted || 1,
      monthly_redirect_limit: u.monthly_redirect_limit || 100,
      monthly_dns_limit: u.monthly_dns_limit || 50,
      notes: u.notes || '',
    });
  };

  const save = async () => {
    if (!editing) return;
    const expiresAt = form.is_active
      ? new Date(Date.now() + form.months_granted * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { error } = await supabase
      .from('user_subscriptions')
      .upsert({
        user_id: editing.user_id,
        is_active: form.is_active,
        months_granted: form.months_granted,
        expires_at: expiresAt,
        monthly_redirect_limit: form.monthly_redirect_limit,
        monthly_dns_limit: form.monthly_dns_limit,
        notes: form.notes,
      }, { onConflict: 'user_id' });

    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Subscription updated' });
      setEditing(null);
      load();
    }
  };

  const togglePause = async (u: UserRow) => {
    const { error } = await supabase
      .from('user_subscriptions')
      .update({ is_active: !u.is_active })
      .eq('user_id', u.user_id);
    if (error) {
      toast({ title: 'Failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: !u.is_active ? 'Subscription started' : 'Subscription paused' });
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">Manage user subscriptions and limits</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
          <CardDescription>Pause/start subscriptions and set monthly limits</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Limits (R/DNS)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id}>
                    <TableCell>
                      <div className="font-medium">{u.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{u.workspace_name || '—'}</TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <Badge className="bg-success/10 text-success hover:bg-success/20">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.expires_at ? format(new Date(u.expires_at), 'MMM d, yyyy') : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.monthly_redirect_limit} / {u.monthly_dns_limit}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button size="sm" variant="outline" onClick={() => togglePause(u)}>
                        {u.is_active ? 'Pause' : 'Start'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openEdit(u)}>
                        <Settings2 className="h-3 w-3 mr-1" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>{editing?.email}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label>Subscription Active</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Months Granted</Label>
              <Input
                type="number"
                min={1}
                value={form.months_granted}
                onChange={(e) => setForm({ ...form, months_granted: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground">Expiry will be set to today + this many months.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monthly Redirects</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthly_redirect_limit}
                  onChange={(e) => setForm({ ...form, monthly_redirect_limit: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Monthly DNS Changes</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.monthly_dns_limit}
                  onChange={(e) => setForm({ ...form, monthly_dns_limit: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

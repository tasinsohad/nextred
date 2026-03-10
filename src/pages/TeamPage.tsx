import { useState } from 'react';
import { useTeam, TeamRole } from '@/hooks/useTeam';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, UserPlus, Mail, Shield, Pencil, Eye, Trash2, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function CreateTeamForm({ onCreate }: { onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    await onCreate(name.trim());
    setCreating(false);
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <Users className="h-7 w-7 text-primary" />
          </div>
          <CardTitle>Create Your Team</CardTitle>
          <CardDescription>Start collaborating by creating a team</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="teamName">Team Name</Label>
              <Input
                id="teamName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Marketing Team"
              />
            </div>
            <Button type="submit" className="w-full" disabled={creating || !name.trim()}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create Team'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

const roleIcons = {
  admin: Shield,
  editor: Pencil,
  viewer: Eye,
};

const roleColors: Record<string, string> = {
  admin: 'bg-destructive/10 text-destructive border-destructive/20',
  editor: 'bg-primary/10 text-primary border-primary/20',
  viewer: 'bg-muted text-muted-foreground border-border',
  owner: 'bg-warning/10 text-warning-foreground border-warning/20',
};

export default function TeamPage() {
  const { user } = useAuth();
  const {
    team, members, invitations, loading, myRole, canManageTeam,
    createTeam, inviteMember, cancelInvitation, updateMemberRole, removeMember,
  } = useTeam();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('viewer');
  const [inviting, setInviting] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    await inviteMember(inviteEmail, inviteRole);
    setInviteEmail('');
    setInviting(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground animate-pulse">Loading team...</div>;
  }

  if (!team) {
    return <CreateTeamForm onCreate={createTeam} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">{team.name}</h2>
        <p className="text-muted-foreground">Manage your team members and invitations</p>
      </div>

      {/* Invite Form */}
      {canManageTeam && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Invite Team Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com"
                />
              </div>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as TeamRole)}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={inviting || !inviteEmail.trim()}>
                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Invite'}
              </Button>
            </form>
            <div className="mt-3 text-xs text-muted-foreground space-y-1">
              <p><strong>Admin</strong> — Can manage members, run operations, view results</p>
              <p><strong>Editor</strong> — Can run bulk operations and view results</p>
              <p><strong>Viewer</strong> — Can only view operation results and dashboard</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Team Members ({members.length + 1})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Owner */}
          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                {user?.email?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground">You</p>
              </div>
            </div>
            <Badge variant="outline" className={roleColors.owner}>Owner</Badge>
          </div>

          {/* Members */}
          {members.filter(m => m.user_id !== user?.id).map((member) => {
            const RoleIcon = roleIcons[member.role] || Eye;
            return (
              <div key={member.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-semibold text-sm">
                    {(member.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.full_name || member.email || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canManageTeam ? (
                    <Select
                      value={member.role}
                      onValueChange={(v) => updateMemberRole(member.id, v as TeamRole)}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className={roleColors[member.role]}>
                      <RoleIcon className="h-3 w-3 mr-1" />
                      {member.role}
                    </Badge>
                  )}
                  {canManageTeam && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeMember(member.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Pending Invitations ({invitations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-warning/10 flex items-center justify-center text-warning-foreground">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited as {inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {canManageTeam && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => cancelInvitation(inv.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

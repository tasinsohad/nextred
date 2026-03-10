import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type TeamRole = 'admin' | 'editor' | 'viewer';

export interface Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
  email?: string;
  full_name?: string;
}

export interface TeamInvitation {
  id: string;
  team_id: string;
  email: string;
  role: TeamRole;
  invited_by: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export function useTeam() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [myRole, setMyRole] = useState<TeamRole | 'owner' | null>(null);

  const loadTeam = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Check if user owns a team
      const { data: ownedTeams } = await supabase
        .from('teams')
        .select('*')
        .eq('owner_id', user.id)
        .limit(1);

      let currentTeam: Team | null = null;

      if (ownedTeams && ownedTeams.length > 0) {
        currentTeam = ownedTeams[0] as Team;
        setMyRole('owner');
      } else {
        // Check if user is a member of any team
        const { data: memberships } = await supabase
          .from('team_members')
          .select('team_id, role')
          .eq('user_id', user.id)
          .limit(1);

        if (memberships && memberships.length > 0) {
          const { data: memberTeam } = await supabase
            .from('teams')
            .select('*')
            .eq('id', memberships[0].team_id)
            .single();

          if (memberTeam) {
            currentTeam = memberTeam as Team;
            setMyRole(memberships[0].role as TeamRole);
          }
        }
      }

      setTeam(currentTeam);

      if (currentTeam) {
        // Load members with profile info
        const { data: teamMembers } = await supabase
          .from('team_members')
          .select('*')
          .eq('team_id', currentTeam.id);

        if (teamMembers) {
          // Fetch profile info for each member
          const memberIds = teamMembers.map(m => m.user_id);
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, email, full_name')
            .in('user_id', memberIds);

          const enriched = teamMembers.map(m => {
            const profile = profiles?.find(p => p.user_id === m.user_id);
            return {
              ...m,
              role: m.role as TeamRole,
              email: profile?.email || '',
              full_name: profile?.full_name || '',
            };
          });
          setMembers(enriched);
        }

        // Load invitations
        const { data: invites } = await supabase
          .from('team_invitations')
          .select('*')
          .eq('team_id', currentTeam.id)
          .eq('status', 'pending');

        if (invites) {
          setInvitations(invites as TeamInvitation[]);
        }
      }
    } catch (err) {
      console.error('Error loading team:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  const createTeam = async (name: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, owner_id: user.id })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    // Add owner as admin member
    await supabase.from('team_members').insert({
      team_id: data.id,
      user_id: user.id,
      role: 'admin',
    });

    toast({ title: 'Team created', description: `"${name}" team has been created.` });
    await loadTeam();
  };

  const inviteMember = async (email: string, role: TeamRole) => {
    if (!user || !team) return;
    const { error } = await supabase
      .from('team_invitations')
      .insert({
        team_id: team.id,
        email: email.toLowerCase().trim(),
        role,
        invited_by: user.id,
      });

    if (error) {
      if (error.message.includes('duplicate')) {
        toast({ title: 'Already invited', description: 'This email already has a pending invitation.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      }
      return;
    }

    toast({ title: 'Invitation sent', description: `Invited ${email} as ${role}.` });
    await loadTeam();
  };

  const cancelInvitation = async (invitationId: string) => {
    const { error } = await supabase
      .from('team_invitations')
      .delete()
      .eq('id', invitationId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Invitation cancelled' });
    await loadTeam();
  };

  const updateMemberRole = async (memberId: string, newRole: TeamRole) => {
    const { error } = await supabase
      .from('team_members')
      .update({ role: newRole })
      .eq('id', memberId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Role updated' });
    await loadTeam();
  };

  const removeMember = async (memberId: string) => {
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Member removed' });
    await loadTeam();
  };

  const canManageTeam = myRole === 'owner' || myRole === 'admin';

  return {
    team,
    members,
    invitations,
    loading,
    myRole,
    canManageTeam,
    createTeam,
    inviteMember,
    cancelInvitation,
    updateMemberRole,
    removeMember,
    reload: loadTeam,
  };
}

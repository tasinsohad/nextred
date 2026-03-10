
-- Create team role enum
CREATE TYPE public.team_role AS ENUM ('admin', 'editor', 'viewer');

-- Create teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role team_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);

-- Create team_invitations table
CREATE TABLE public.team_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role team_role NOT NULL DEFAULT 'viewer',
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  UNIQUE (team_id, email, status)
);

-- Create operation_logs table for dashboard
CREATE TABLE public.operation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  operation_type TEXT NOT NULL,
  domains_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;

-- Security definer function to check team membership
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id UUID, _team_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  )
$$;

CREATE OR REPLACE FUNCTION public.get_team_role(_user_id UUID, _team_id UUID)
RETURNS team_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.team_members
  WHERE user_id = _user_id AND team_id = _team_id
  LIMIT 1
$$;

-- Teams: members can view, owner/admin can update
CREATE POLICY "Team members can view team" ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), id) OR owner_id = auth.uid());

CREATE POLICY "Authenticated users can create teams" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Team owner can update team" ON public.teams
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Team owner can delete team" ON public.teams
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- Team members: members can view, admin can manage
CREATE POLICY "Team members can view members" ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));

CREATE POLICY "Team admin can add members" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

CREATE POLICY "Team admin can update members" ON public.team_members
  FOR UPDATE TO authenticated
  USING (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

CREATE POLICY "Team admin can remove members" ON public.team_members
  FOR DELETE TO authenticated
  USING (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid());

-- Invitations: admin can manage, invitee can view
CREATE POLICY "Team admin can view invitations" ON public.team_invitations
  FOR SELECT TO authenticated
  USING (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

CREATE POLICY "Team admin can create invitations" ON public.team_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

CREATE POLICY "Team admin can update invitations" ON public.team_invitations
  FOR UPDATE TO authenticated
  USING (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

CREATE POLICY "Team admin can delete invitations" ON public.team_invitations
  FOR DELETE TO authenticated
  USING (public.get_team_role(auth.uid(), team_id) = 'admin' OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()));

-- Operation logs: user can view own, team members can view team logs
CREATE POLICY "Users can view own operation logs" ON public.operation_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));

CREATE POLICY "Users can insert own operation logs" ON public.operation_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

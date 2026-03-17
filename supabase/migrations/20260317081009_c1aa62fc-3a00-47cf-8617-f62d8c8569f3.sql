
CREATE TABLE public.redirect_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_url text NOT NULL,
  destination_url text NOT NULL,
  domain text NOT NULL,
  subdomain text,
  redirect_type text NOT NULL DEFAULT 'bulk_redirect',
  status_code integer NOT NULL DEFAULT 301,
  cloudflare_account_id uuid REFERENCES public.cloudflare_accounts(id) ON DELETE SET NULL,
  cloudflare_list_id text,
  zone_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.redirect_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own redirect history"
  ON public.redirect_history FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own redirect history"
  ON public.redirect_history FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own redirect history"
  ON public.redirect_history FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own redirect history"
  ON public.redirect_history FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_redirect_history_updated_at
  BEFORE UPDATE ON public.redirect_history
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

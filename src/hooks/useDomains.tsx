import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Domain {
  id: string;
  user_id: string;
  domain_name: string;
  target_url: string;
  is_active: boolean;
  ssl_enabled: boolean;
  cache_enabled: boolean;
  cloudflare_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDomainInput {
  domain_name: string;
  target_url: string;
  is_active?: boolean;
  ssl_enabled?: boolean;
  cache_enabled?: boolean;
}

export interface UpdateDomainInput {
  id: string;
  domain_name?: string;
  target_url?: string;
  is_active?: boolean;
  ssl_enabled?: boolean;
  cache_enabled?: boolean;
}

export function useDomains() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const domainsQuery = useQuery({
    queryKey: ['domains', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('domains')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Domain[];
    },
    enabled: !!user,
  });

  const createDomain = useMutation({
    mutationFn: async (input: CreateDomainInput) => {
      const { data, error } = await supabase
        .from('domains')
        .insert({
          ...input,
          user_id: user!.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as Domain;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });

  const updateDomain = useMutation({
    mutationFn: async ({ id, ...updates }: UpdateDomainInput) => {
      const { data, error } = await supabase
        .from('domains')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as Domain;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });

  const deleteDomain = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('domains')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['domains'] });
    },
  });

  return {
    domains: domainsQuery.data ?? [],
    isLoading: domainsQuery.isLoading,
    error: domainsQuery.error,
    createDomain,
    updateDomain,
    deleteDomain,
  };
}

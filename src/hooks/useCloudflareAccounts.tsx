import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface CloudflareAccount {
  id: string;
  user_id: string;
  account_name: string;
  cloudflare_email: string;
  api_key_encrypted: string;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCloudflareAccountInput {
  account_name: string;
  cloudflare_email: string;
  api_key: string;
}

export interface UpdateCloudflareAccountInput {
  id: string;
  account_name?: string;
  cloudflare_email?: string;
  api_key?: string;
}

interface ValidationResponse {
  valid: boolean;
  accountId: string | null;
  accountName: string | null;
  error?: string;
  details?: string;
}

export function useCloudflareAccounts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const accountsQuery = useQuery({
    queryKey: ['cloudflare-accounts', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cloudflare_accounts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as CloudflareAccount[];
    },
    enabled: !!user,
  });

  const validateCredentials = async (email: string, apiKey: string): Promise<ValidationResponse> => {
    const { data, error } = await supabase.functions.invoke('validate-cloudflare', {
      body: { email, apiKey },
    });

    if (error) {
      throw new Error(error.message || 'Failed to validate credentials');
    }

    return data;
  };

  const createAccount = useMutation({
    mutationFn: async (input: CreateCloudflareAccountInput) => {
      // First validate the credentials
      const validation = await validateCredentials(input.cloudflare_email, input.api_key);
      
      if (!validation.valid) {
        throw new Error(validation.details || validation.error || 'Invalid credentials');
      }

      // Store the account with encrypted API key (simple base64 for now - in production use proper encryption)
      const encryptedKey = btoa(input.api_key);

      const { data, error } = await supabase
        .from('cloudflare_accounts')
        .insert({
          user_id: user!.id,
          account_name: input.account_name,
          cloudflare_email: input.cloudflare_email,
          api_key_encrypted: encryptedKey,
          account_id: validation.accountId,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data as CloudflareAccount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare-accounts'] });
    },
  });

  const updateAccount = useMutation({
    mutationFn: async ({ id, api_key, ...updates }: UpdateCloudflareAccountInput) => {
      const updateData: Record<string, unknown> = { ...updates };
      
      // If API key is being updated, validate and encrypt it
      if (api_key) {
        const email = updates.cloudflare_email || accountsQuery.data?.find(a => a.id === id)?.cloudflare_email;
        if (email) {
          const validation = await validateCredentials(email, api_key);
          if (!validation.valid) {
            throw new Error(validation.details || validation.error || 'Invalid credentials');
          }
          updateData.api_key_encrypted = btoa(api_key);
          updateData.account_id = validation.accountId;
        }
      }

      const { data, error } = await supabase
        .from('cloudflare_accounts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as CloudflareAccount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare-accounts'] });
    },
  });

  const deleteAccount = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('cloudflare_accounts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cloudflare-accounts'] });
    },
  });

  return {
    accounts: accountsQuery.data ?? [],
    isLoading: accountsQuery.isLoading,
    error: accountsQuery.error,
    createAccount,
    updateAccount,
    deleteAccount,
    validateCredentials,
  };
}

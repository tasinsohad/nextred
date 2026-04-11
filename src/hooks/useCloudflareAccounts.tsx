import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

type CloudflareAuthType = 'token' | 'global';

const TOKEN_SENTINEL_EMAIL = 'api-token@cloudflare';

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
  auth_type?: CloudflareAuthType;
  accountId?: string;
}

export interface UpdateCloudflareAccountInput {
  id: string;
  account_name?: string;
  cloudflare_email?: string;
  api_key?: string;
  auth_type?: CloudflareAuthType;
}

interface ValidationResponse {
  valid: boolean;
  accountId: string | null;
  accountName: string | null;
  error?: string;
  details?: string;
}

interface EdgeFunctionErrorLike {
  message?: string;
  context?: Response;
}

const normalizeApiKey = (value: string) => value.trim().replace(/^Bearer\s+/i, '').trim();

const getFunctionErrorMessage = async (error: EdgeFunctionErrorLike) => {
  if (error.context) {
    try {
      const payload = await error.context.clone().json();
      return payload?.details || payload?.detail || payload?.error || payload?.errors?.[0]?.message || error.message;
    } catch {
      try {
        const text = await error.context.clone().text();
        if (text) return text;
      } catch {
        // Ignore response parsing failures and fall back to the default message.
      }
    }
  }

  return error.message || 'Failed to validate credentials';
};

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

  const validateCredentials = async (email: string, apiKey: string, authType?: CloudflareAuthType, accountId?: string): Promise<ValidationResponse> => {
    const { data, error } = await supabase.functions.invoke('validate-cloudflare', {
      body: { email, apiKey: normalizeApiKey(apiKey), authType, accountId },
    });

    if (error) {
      throw new Error(await getFunctionErrorMessage(error as EdgeFunctionErrorLike));
    }

    return data;
  };

  const createAccount = useMutation({
    mutationFn: async (input: CreateCloudflareAccountInput) => {
      const normalizedApiKey = normalizeApiKey(input.api_key);

      // First validate the credentials
      const validation = await validateCredentials(input.cloudflare_email, normalizedApiKey, input.auth_type, input.accountId);
      
      if (!validation.valid) {
        throw new Error(validation.details || validation.error || 'Invalid credentials');
      }

      // Store the account with encrypted API key (simple base64 for now - in production use proper encryption)
      const encryptedKey = btoa(normalizedApiKey);

      const { data, error } = await supabase
        .from('cloudflare_accounts')
        .insert({
          user_id: user!.id,
          account_name: input.account_name,
          cloudflare_email: input.auth_type === 'token' ? TOKEN_SENTINEL_EMAIL : input.cloudflare_email,
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
    mutationFn: async ({ id, api_key, auth_type, ...updates }: UpdateCloudflareAccountInput) => {
      const updateData: Record<string, unknown> = { ...updates };
      const existingAccount = accountsQuery.data?.find(a => a.id === id);
      const effectiveAuthType = auth_type || (existingAccount?.cloudflare_email === TOKEN_SENTINEL_EMAIL ? 'token' : 'global');

      if (effectiveAuthType === 'token') {
        updateData.cloudflare_email = TOKEN_SENTINEL_EMAIL;
      }
      
      // If API key is being updated, validate and encrypt it
      if (api_key) {
        const normalizedApiKey = normalizeApiKey(api_key);
        const email = effectiveAuthType === 'token'
          ? TOKEN_SENTINEL_EMAIL
          : updates.cloudflare_email || existingAccount?.cloudflare_email;

        if (email) {
          const validation = await validateCredentials(email, normalizedApiKey, effectiveAuthType);
          if (!validation.valid) {
            throw new Error(validation.details || validation.error || 'Invalid credentials');
          }
          updateData.api_key_encrypted = btoa(normalizedApiKey);
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

import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface StatusCheck {
  success: boolean;
  message: string;
  latency?: number;
  statusCode?: number;
}

export interface DomainStatusResult {
  domain: string;
  targetUrl: string;
  checks: {
    configApi: StatusCheck;
    workerResponse: StatusCheck;
    contentRewrite: StatusCheck;
  };
  overall: 'healthy' | 'partial' | 'error';
}

export function useDomainStatus() {
  const checkStatus = useMutation({
    mutationFn: async (domainId: string): Promise<DomainStatusResult> => {
      const { data, error } = await supabase.functions.invoke('check-domain-status', {
        body: { domainId },
      });

      if (error) {
        throw new Error(error.message || 'Failed to check domain status');
      }

      if (!data.success) {
        throw new Error(data.error || 'Status check failed');
      }

      return data.result;
    },
  });

  return { checkStatus };
}

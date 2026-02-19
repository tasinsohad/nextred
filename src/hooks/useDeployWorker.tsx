import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface DeployWorkerInput {
  domainId: string;
  cloudflareAccountId: string;
}

interface DeployWorkerResult {
  success: boolean;
  workerDeployed: boolean;
  routeCreated: boolean;
  message: string;
  workerName?: string;
  routePattern?: string;
}

export function useDeployWorker() {
  const deployWorker = useMutation({
    mutationFn: async (input: DeployWorkerInput): Promise<DeployWorkerResult> => {
      const { data, error } = await supabase.functions.invoke('deploy-worker', {
        body: input,
      });

      if (error) {
        throw new Error(error.message || 'Failed to deploy worker');
      }

      if (!data.success && data.error) {
        throw new Error(data.details || data.error);
      }

      return data;
    },
  });

  return { deployWorker };
}

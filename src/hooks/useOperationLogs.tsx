import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface OperationLog {
  id: string;
  user_id: string;
  team_id: string | null;
  operation_type: string;
  domains_count: number;
  success_count: number;
  failure_count: number;
  details: Record<string, unknown>;
  created_at: string;
}

export function useOperationLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOperations: 0,
    totalDomains: 0,
    totalSuccess: 0,
    totalFailures: 0,
  });

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data, error } = await supabase
        .from('operation_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        const typed = data as OperationLog[];
        setLogs(typed);
        setStats({
          totalOperations: typed.length,
          totalDomains: typed.reduce((sum, l) => sum + l.domains_count, 0),
          totalSuccess: typed.reduce((sum, l) => sum + l.success_count, 0),
          totalFailures: typed.reduce((sum, l) => sum + l.failure_count, 0),
        });
      }
      setLoading(false);
    };
    load();
  }, [user]);

  const logOperation = async (log: Omit<OperationLog, 'id' | 'created_at' | 'user_id'>) => {
    if (!user) return;
    await supabase.from('operation_logs').insert({
      ...log,
      user_id: user.id,
    });
  };

  return { logs, loading, stats, logOperation };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface TrafficLog {
  id: string;
  domain_id: string;
  visitor_ip: string | null;
  user_agent: string | null;
  request_path: string | null;
  referer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
  country_code: string | null;
  created_at: string;
}

export interface DomainStats {
  domain_id: string;
  domain_name: string;
  total_visits: number;
  unique_visitors: number;
  utm_breakdown: { source: string; count: number }[];
  recent_traffic: { date: string; count: number }[];
}

export function useAnalytics(domainId?: string) {
  const { user } = useAuth();

  const trafficLogsQuery = useQuery({
    queryKey: ['traffic-logs', domainId],
    queryFn: async () => {
      let query = supabase
        .from('traffic_logs')
        .select('*, domains!inner(user_id, domain_name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (domainId) {
        query = query.eq('domain_id', domainId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (TrafficLog & { domains: { user_id: string; domain_name: string } })[];
    },
    enabled: !!user,
  });

  const statsQuery = useQuery({
    queryKey: ['domain-stats', domainId],
    queryFn: async () => {
      // Get all domains for the user
      const { data: domains, error: domainsError } = await supabase
        .from('domains')
        .select('id, domain_name');
      
      if (domainsError) throw domainsError;

      const stats: DomainStats[] = [];

      for (const domain of domains || []) {
        if (domainId && domain.id !== domainId) continue;

        // Get traffic logs for this domain
        const { data: logs, error: logsError } = await supabase
          .from('traffic_logs')
          .select('*')
          .eq('domain_id', domain.id);

        if (logsError) continue;

        const uniqueIps = new Set(logs?.map(l => l.visitor_ip).filter(Boolean));
        
        // UTM breakdown
        const utmCounts: Record<string, number> = {};
        logs?.forEach(log => {
          if (log.utm_source) {
            utmCounts[log.utm_source] = (utmCounts[log.utm_source] || 0) + 1;
          }
        });

        // Recent traffic (last 7 days)
        const now = new Date();
        const recentTraffic: { date: string; count: number }[] = [];
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now);
          date.setDate(date.getDate() - i);
          const dateStr = date.toISOString().split('T')[0];
          const count = logs?.filter(l => 
            l.created_at.startsWith(dateStr)
          ).length || 0;
          recentTraffic.push({ date: dateStr, count });
        }

        stats.push({
          domain_id: domain.id,
          domain_name: domain.domain_name,
          total_visits: logs?.length || 0,
          unique_visitors: uniqueIps.size,
          utm_breakdown: Object.entries(utmCounts).map(([source, count]) => ({ source, count })),
          recent_traffic: recentTraffic,
        });
      }

      return stats;
    },
    enabled: !!user,
  });

  return {
    trafficLogs: trafficLogsQuery.data ?? [],
    stats: statsQuery.data ?? [],
    isLoading: trafficLogsQuery.isLoading || statsQuery.isLoading,
    error: trafficLogsQuery.error || statsQuery.error,
  };
}

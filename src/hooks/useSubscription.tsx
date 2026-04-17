import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Subscription {
  id: string;
  user_id: string;
  is_active: boolean;
  months_granted: number;
  expires_at: string | null;
  monthly_redirect_limit: number;
  monthly_dns_limit: number;
  notes: string | null;
}

export interface UsageStats {
  redirects: number;
  dns_changes: number;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<UsageStats>({ redirects: 0, dns_changes: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: sub }, redirectsRes, dnsRes] = await Promise.all([
      supabase.from('user_subscriptions').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.rpc('get_monthly_usage', { _user_id: user.id, _event_type: 'redirect' }),
      supabase.rpc('get_monthly_usage', { _user_id: user.id, _event_type: 'dns_change' }),
    ]);
    setSubscription(sub as Subscription | null);
    setUsage({
      redirects: (redirectsRes.data as number) || 0,
      dns_changes: (dnsRes.data as number) || 0,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isExpired = subscription?.expires_at
    ? new Date(subscription.expires_at) < new Date()
    : true;

  const isLocked = !subscription || !subscription.is_active;
  const isReadOnly = !isLocked && isExpired;

  const recordUsage = async (eventType: 'redirect' | 'dns_change') => {
    if (!user) return { ok: false, reason: 'No user' };
    const limit = eventType === 'redirect'
      ? subscription?.monthly_redirect_limit ?? 0
      : subscription?.monthly_dns_limit ?? 0;
    const current = eventType === 'redirect' ? usage.redirects : usage.dns_changes;
    if (current >= limit) {
      return { ok: false, reason: 'Monthly limit reached' };
    }
    await supabase.from('usage_events').insert({ user_id: user.id, event_type: eventType });
    setUsage((u) => ({
      ...u,
      [eventType === 'redirect' ? 'redirects' : 'dns_changes']: current + 1,
    }));
    return { ok: true };
  };

  return {
    subscription,
    usage,
    loading,
    isLocked,
    isReadOnly,
    isExpired,
    recordUsage,
    refresh,
  };
}

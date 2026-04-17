import { ReactNode } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock, AlertTriangle, Eye } from 'lucide-react';

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const { loading, isLocked, isReadOnly, subscription, usage } = useSubscription();

  if (loading) return <>{children}</>;

  if (isLocked) {
    return (
      <div className="max-w-xl mx-auto mt-12">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Account Pending Activation</CardTitle>
            <CardDescription>
              Your account has been created but is waiting for admin activation.
              Please contact your administrator to enable your subscription.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center text-sm text-muted-foreground">
            Once activated, you'll have access to all features within your monthly limits.
          </CardContent>
        </Card>
      </div>
    );
  }

  const redirectPct = subscription?.monthly_redirect_limit
    ? (usage.redirects / subscription.monthly_redirect_limit) * 100
    : 0;
  const dnsPct = subscription?.monthly_dns_limit
    ? (usage.dns_changes / subscription.monthly_dns_limit) * 100
    : 0;

  return (
    <div className="space-y-4">
      {isReadOnly && (
        <Alert>
          <Eye className="h-4 w-4" />
          <AlertTitle>Read-only mode</AlertTitle>
          <AlertDescription>
            Your subscription has expired. You can view your data, but cannot create or edit until an admin extends it.
          </AlertDescription>
        </Alert>
      )}
      {(redirectPct >= 80 || dnsPct >= 80) && !isReadOnly && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Approaching monthly limit</AlertTitle>
          <AlertDescription>
            {redirectPct >= 80 && (
              <div>Redirects: {usage.redirects} / {subscription?.monthly_redirect_limit} used ({Math.round(redirectPct)}%)</div>
            )}
            {dnsPct >= 80 && (
              <div>DNS changes: {usage.dns_changes} / {subscription?.monthly_dns_limit} used ({Math.round(dnsPct)}%)</div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {children}
    </div>
  );
}

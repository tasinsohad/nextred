import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useOperationLogs } from '@/hooks/useOperationLogs';
import { useTeam } from '@/hooks/useTeam';
import { supabase } from '@/integrations/supabase/client';
import { Globe, ArrowRightLeft, CheckCircle2, XCircle, Activity, Clock, TrendingUp, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

export default function DashboardHome() {
  const { user } = useAuth();
  const { logs, loading: logsLoading, stats } = useOperationLogs();
  const { team, members } = useTeam();
  const navigate = useNavigate();
  const [savedAccountsCount, setSavedAccountsCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('cloudflare_accounts')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => setSavedAccountsCount(count || 0));
  }, [user]);

  const statCards = [
    {
      label: 'Total Operations',
      value: stats.totalOperations,
      icon: Activity,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Domains Managed',
      value: stats.totalDomains,
      icon: Globe,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Successful Changes',
      value: stats.totalSuccess,
      icon: CheckCircle2,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      label: 'Failed Changes',
      value: stats.totalFailures,
      icon: XCircle,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">
            Welcome back
          </p>
        </div>
        <Button onClick={() => navigate('/app/bulk')}>
          <ArrowRightLeft className="h-4 w-4 mr-2" />
          New Bulk Operation
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{stat.label}</p>
                  <p className="text-3xl font-bold mt-1">{stat.value}</p>
                </div>
                <div className={`w-12 h-12 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Operations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Recent Operations
            </CardTitle>
            <CardDescription>Your latest bulk operations</CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="text-center py-8 text-muted-foreground animate-pulse">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground text-sm">No operations yet</p>
                <p className="text-xs text-muted-foreground mt-1">Run your first bulk operation to see results here</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/app/bulk')}>
                  Start Now
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.slice(0, 8).map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-md border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        log.failure_count === 0 ? 'bg-success/10' : 'bg-destructive/10'
                      }`}>
                        {log.failure_count === 0 ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium capitalize">{log.operation_type.replace('_', ' ')}</p>
                        <p className="text-xs text-muted-foreground">
                          {log.domains_count} domains · {log.success_count} ok · {log.failure_count} failed
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(log.created_at), 'MMM d, HH:mm')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Info */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Saved Accounts</span>
                <Badge variant="secondary">{savedAccountsCount}</Badge>
              </div>
              {team && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Team Members</span>
                  <Badge variant="secondary">{members.length + 1}</Badge>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Success Rate</span>
                <Badge variant="secondary">
                  {stats.totalOperations > 0
                    ? `${Math.round((stats.totalSuccess / (stats.totalSuccess + stats.totalFailures || 1)) * 100)}%`
                    : 'N/A'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {team && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {team.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex -space-x-2">
                  {members.slice(0, 5).map((m, i) => (
                    <div
                      key={m.id}
                      className="w-8 h-8 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center text-xs font-semibold text-primary"
                      title={m.email || ''}
                    >
                      {(m.email || '?').charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {members.length > 5 && (
                    <div className="w-8 h-8 rounded-full bg-muted border-2 border-card flex items-center justify-center text-xs text-muted-foreground">
                      +{members.length - 5}
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" className="w-full mt-3" onClick={() => navigate('/app/team')}>
                  Manage Team
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

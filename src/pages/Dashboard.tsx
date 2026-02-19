import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDomains } from '@/hooks/useDomains';
import { useAnalytics } from '@/hooks/useAnalytics';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe, BarChart3, Plus, ArrowUpRight, Activity, Users } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { domains, isLoading: domainsLoading } = useDomains();
  const { stats, isLoading: statsLoading } = useAnalytics();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading || domainsLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  const totalVisits = stats.reduce((acc, s) => acc + s.total_visits, 0);
  const totalUniqueVisitors = stats.reduce((acc, s) => acc + s.unique_visitors, 0);
  const activeDomains = domains.filter(d => d.is_active).length;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground mt-1">Manage your domains and view analytics</p>
          </div>
          <Button asChild>
            <Link to="/dashboard/domains">
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Link>
          </Button>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Domains</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{domains.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeDomains} active
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Visits</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalVisits.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All time
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Visitors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalUniqueVisitors.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">
                By IP address
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Analytics</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Domains tracked
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent domains */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Domains</CardTitle>
              <CardDescription>Your most recently added domains</CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard/domains">
                View All
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No domains yet</h3>
                <p className="text-muted-foreground mb-4">Get started by adding your first domain</p>
                <Button asChild>
                  <Link to="/dashboard/domains">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Domain
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {domains.slice(0, 5).map((domain) => {
                  const domainStats = stats.find(s => s.domain_id === domain.id);
                  return (
                    <div 
                      key={domain.id}
                      className="flex items-center justify-between p-4 border border-border"
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 ${domain.is_active ? 'bg-green-500' : 'bg-muted'}`} />
                        <div>
                          <p className="font-medium">{domain.domain_name}</p>
                          <p className="text-sm text-muted-foreground">{domain.target_url}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{domainStats?.total_visits || 0} visits</p>
                        <p className="text-xs text-muted-foreground">{domainStats?.unique_visitors || 0} unique</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

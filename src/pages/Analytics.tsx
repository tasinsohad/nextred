import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDomains } from '@/hooks/useDomains';
import { useAnalytics } from '@/hooks/useAnalytics';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, Globe, Users, Activity } from 'lucide-react';

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export default function Analytics() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { domains } = useDomains();
  const [selectedDomain, setSelectedDomain] = useState<string>('all');
  const { stats, trafficLogs, isLoading: analyticsLoading } = useAnalytics(
    selectedDomain === 'all' ? undefined : selectedDomain
  );

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading || analyticsLoading) {
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

  // Aggregate traffic data for chart
  const trafficData = stats.reduce((acc, s) => {
    s.recent_traffic.forEach(t => {
      const existing = acc.find(a => a.date === t.date);
      if (existing) {
        existing.count += t.count;
      } else {
        acc.push({ ...t });
      }
    });
    return acc;
  }, [] as { date: string; count: number }[]).sort((a, b) => a.date.localeCompare(b.date));

  // Aggregate UTM data for pie chart
  const utmData = stats.reduce((acc, s) => {
    s.utm_breakdown.forEach(u => {
      const existing = acc.find(a => a.source === u.source);
      if (existing) {
        existing.count += u.count;
      } else {
        acc.push({ ...u });
      }
    });
    return acc;
  }, [] as { source: string; count: number }[]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground mt-1">Track visitor activity and traffic sources</p>
          </div>
          <Select value={selectedDomain} onValueChange={setSelectedDomain}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domains.map(domain => (
                <SelectItem key={domain.id} value={domain.id}>
                  {domain.domain_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Visits</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalVisits.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unique Visitors</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totalUniqueVisitors.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Domains</CardTitle>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">UTM Sources</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{utmData.length}</div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Traffic (Last 7 Days)</CardTitle>
              <CardDescription>Daily visitor count across all domains</CardDescription>
            </CardHeader>
            <CardContent>
              {trafficData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={trafficData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { weekday: 'short' })}
                      className="text-muted-foreground"
                    />
                    <YAxis className="text-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 0 
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" name="Visits" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No traffic data yet
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>UTM Sources</CardTitle>
              <CardDescription>Breakdown of traffic by source</CardDescription>
            </CardHeader>
            <CardContent>
              {utmData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={utmData}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {utmData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 0 
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  No UTM data yet
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent traffic logs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Traffic</CardTitle>
            <CardDescription>Latest visitor activity</CardDescription>
          </CardHeader>
          <CardContent>
            {trafficLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Path</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Referrer</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trafficLogs.slice(0, 10).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-medium">{log.domains?.domain_name}</TableCell>
                        <TableCell className="font-mono text-sm">{log.request_path || '/'}</TableCell>
                        <TableCell>
                          {log.utm_source ? (
                            <Badge variant="secondary">{log.utm_source}</Badge>
                          ) : log.fbclid ? (
                            <Badge variant="secondary">Facebook</Badge>
                          ) : log.gclid ? (
                            <Badge variant="secondary">Google</Badge>
                          ) : (
                            <span className="text-muted-foreground">Direct</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">
                          {log.referer || '-'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No traffic logs yet. Traffic will be recorded when visitors access your masked domains.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

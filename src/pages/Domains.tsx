import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDomains } from '@/hooks/useDomains';
import { useAnalytics } from '@/hooks/useAnalytics';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { DomainCard } from '@/components/domains/DomainCard';
import { AddDomainDialog } from '@/components/domains/AddDomainDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Globe } from 'lucide-react';

export default function Domains() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { domains, isLoading: domainsLoading } = useDomains();
  const { stats } = useAnalytics();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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

  const filteredDomains = domains.filter(domain =>
    domain.domain_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    domain.target_url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Domains</h1>
            <p className="text-muted-foreground mt-1">
              Manage your masked domains ({domains.length} total)
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Domain
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search domains..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Domain grid */}
        {filteredDomains.length === 0 ? (
          <div className="text-center py-16">
            <Globe className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            {searchQuery ? (
              <>
                <h3 className="text-lg font-medium text-foreground mb-2">No domains found</h3>
                <p className="text-muted-foreground">Try adjusting your search query</p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-foreground mb-2">No domains yet</h3>
                <p className="text-muted-foreground mb-4">Get started by adding your first domain</p>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Domain
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredDomains.map((domain) => {
              const domainStats = stats.find(s => s.domain_id === domain.id);
              return (
                <DomainCard
                  key={domain.id}
                  domain={domain}
                  stats={domainStats ? {
                    total_visits: domainStats.total_visits,
                    unique_visitors: domainStats.unique_visitors,
                  } : undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      <AddDomainDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </DashboardLayout>
  );
}

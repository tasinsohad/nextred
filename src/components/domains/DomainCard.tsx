import { useState } from 'react';
import { Domain, useDomains, UpdateDomainInput } from '@/hooks/useDomains';
import { useDomainStatus, DomainStatusResult } from '@/hooks/useDomainStatus';
import { useDeployWorker } from '@/hooks/useDeployWorker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Globe, Edit, Trash2, ExternalLink, Copy, Check, Activity, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2, Rocket } from 'lucide-react';

interface DomainCardProps {
  domain: Domain;
  stats?: { total_visits: number; unique_visitors: number };
}

export function DomainCard({ domain, stats }: DomainCardProps) {
  const { updateDomain, deleteDomain } = useDomains();
  const { checkStatus } = useDomainStatus();
  const { deployWorker } = useDeployWorker();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusResult, setStatusResult] = useState<DomainStatusResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState<UpdateDomainInput>({
    id: domain.id,
    domain_name: domain.domain_name,
    target_url: domain.target_url,
    is_active: domain.is_active,
    ssl_enabled: domain.ssl_enabled,
    cache_enabled: domain.cache_enabled,
  });

  const handleCheckStatus = async () => {
    setStatusOpen(true);
    setStatusResult(null);
    try {
      const result = await checkStatus.mutateAsync(domain.id);
      setStatusResult(result);
    } catch (error) {
      console.error('Status check failed:', error);
    }
  };

  const handleRedeploy = async () => {
    if (!domain.cloudflare_account_id) return;
    try {
      await deployWorker.mutateAsync({
        domainId: domain.id,
        cloudflareAccountId: domain.cloudflare_account_id,
      });
      // Re-check status after deploy
      const result = await checkStatus.mutateAsync(domain.id);
      setStatusResult(result);
    } catch (error) {
      console.error('Redeploy failed:', error);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(domain.domain_name);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateDomain.mutateAsync(formData);
    setEditOpen(false);
  };

  const handleDelete = async () => {
    await deleteDomain.mutateAsync(domain.id);
    setDeleteOpen(false);
  };

  const handleToggleActive = async () => {
    await updateDomain.mutateAsync({
      id: domain.id,
      is_active: !domain.is_active,
    });
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 ${domain.is_active ? 'bg-primary' : 'bg-muted'}`}>
                <Globe className={`h-5 w-5 ${domain.is_active ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-lg">{domain.domain_name}</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={`w-2 h-2 ${domain.is_active ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                  {domain.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={handleCheckStatus} title="Check Status">
                <Activity className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Target:</span>
            <a 
              href={domain.target_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-foreground hover:underline flex items-center gap-1 truncate"
            >
              {domain.target_url}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Visits</p>
                <p className="font-semibold">{stats?.total_visits ?? 0}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Unique</p>
                <p className="font-semibold">{stats?.unique_visitors ?? 0}</p>
              </div>
            </div>
            <Switch
              checked={domain.is_active}
              onCheckedChange={handleToggleActive}
            />
          </div>

          <div className="flex gap-2 text-xs">
            {domain.ssl_enabled && (
              <span className="px-2 py-1 bg-secondary text-secondary-foreground">SSL</span>
            )}
            {domain.cache_enabled && (
              <span className="px-2 py-1 bg-secondary text-secondary-foreground">Cache</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Edit Domain</DialogTitle>
              <DialogDescription>Update your domain configuration</DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Domain Name</Label>
                <Input
                  value={formData.domain_name}
                  onChange={(e) => setFormData({ ...formData, domain_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Target URL</Label>
                <Input
                  value={formData.target_url}
                  onChange={(e) => setFormData({ ...formData, target_url: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>SSL Enabled</Label>
                <Switch
                  checked={formData.ssl_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, ssl_enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Cache Enabled</Label>
                <Switch
                  checked={formData.cache_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, cache_enabled: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateDomain.isPending}>
                {updateDomain.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Domain</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{domain.domain_name}</strong>? 
              This action cannot be undone and will remove all associated traffic logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Check Dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Domain Status Check
            </DialogTitle>
            <DialogDescription>
              Checking {domain.domain_name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {checkStatus.isPending && !statusResult ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : statusResult ? (
              <>
                {/* Overall Status */}
                <div className={`p-4 rounded-lg border ${
                  statusResult.overall === 'healthy' 
                    ? 'bg-green-500/10 border-green-500/20' 
                    : statusResult.overall === 'partial'
                    ? 'bg-yellow-500/10 border-yellow-500/20'
                    : 'bg-destructive/10 border-destructive/20'
                }`}>
                  <div className="flex items-center gap-2">
                    {statusResult.overall === 'healthy' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : statusResult.overall === 'partial' ? (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className="font-semibold">
                      {statusResult.overall === 'healthy' 
                        ? 'All Systems Operational' 
                        : statusResult.overall === 'partial'
                        ? 'Partial Issues Detected'
                        : 'Domain Not Working'}
                    </span>
                  </div>
                </div>

                {/* Individual Checks */}
                <div className="space-y-3">
                  <StatusCheckItem 
                    label="Config API"
                    check={statusResult.checks.configApi}
                  />
                  <StatusCheckItem 
                    label="Worker Response"
                    check={statusResult.checks.workerResponse}
                  />
                  <StatusCheckItem 
                    label="Cloudflare Proxy"
                    check={statusResult.checks.contentRewrite}
                  />
                </div>

                {/* Troubleshooting Tips */}
                {statusResult.overall !== 'healthy' && (
                  <div className="mt-4 p-3 bg-muted rounded-lg text-sm space-y-2">
                    <p className="font-medium">Troubleshooting Tips:</p>
                    <ul className="list-disc list-inside text-muted-foreground space-y-1">
                      {!statusResult.checks.contentRewrite.success && (
                        <li>Ensure DNS has Orange Cloud (Proxied) enabled</li>
                      )}
                      {!statusResult.checks.workerResponse.success && (
                        <>
                          <li>Check that nameservers point to Cloudflare</li>
                          <li>Verify the domain is added to Cloudflare</li>
                        </>
                      )}
                      <li>Wait 1-5 minutes for DNS propagation</li>
                    </ul>
                  </div>
                )}
              </>
            ) : checkStatus.isError ? (
              <div className="text-center py-4 text-destructive">
                Failed to check status. Please try again.
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex gap-2">
            {domain.cloudflare_account_id && (
              <Button 
                variant="outline" 
                onClick={handleRedeploy}
                disabled={deployWorker.isPending}
              >
                {deployWorker.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4 mr-2" />
                )}
                Re-deploy Worker
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={handleCheckStatus}
              disabled={checkStatus.isPending}
            >
              {checkStatus.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recheck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusCheckItem({ label, check }: { label: string; check: { success: boolean; message: string; latency?: number } }) {
  return (
    <div className="flex items-start gap-3 p-2 rounded border border-border">
      {check.success ? (
        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{check.message}</p>
      </div>
    </div>
  );
}

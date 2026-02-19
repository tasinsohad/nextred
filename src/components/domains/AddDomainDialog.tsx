import { useState } from 'react';
import { useDomains, CreateDomainInput } from '@/hooks/useDomains';
import { useCloudflareAccounts } from '@/hooks/useCloudflareAccounts';
import { useDeployWorker } from '@/hooks/useDeployWorker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { z } from 'zod';
import { toast } from 'sonner';
import { Cloud, Loader2 } from 'lucide-react';

const domainSchema = z.object({
  domain_name: z.string()
    .min(1, 'Domain name is required')
    .max(253, 'Domain name too long')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/, 'Invalid domain format'),
  target_url: z.string()
    .url('Must be a valid URL')
    .max(2048, 'URL too long'),
});

interface AddDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddDomainDialog({ open, onOpenChange }: AddDomainDialogProps) {
  const { createDomain } = useDomains();
  const { accounts, isLoading: accountsLoading } = useCloudflareAccounts();
  const { deployWorker } = useDeployWorker();
  
  const [formData, setFormData] = useState<CreateDomainInput & { cloudflare_account_id?: string }>({
    domain_name: '',
    target_url: '',
    is_active: true,
    ssl_enabled: true,
    cache_enabled: true,
    cloudflare_account_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      domainSchema.parse(formData);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const newErrors: Record<string, string> = {};
        err.errors.forEach((error) => {
          if (error.path[0]) {
            newErrors[error.path[0] as string] = error.message;
          }
        });
        setErrors(newErrors);
        return;
      }
    }

    if (!formData.cloudflare_account_id) {
      setErrors({ cloudflare_account_id: 'Please select a Cloudflare account' });
      return;
    }

    setIsSubmitting(true);
    setDeploymentStatus('Creating domain...');

    try {
      // Create the domain first
      const newDomain = await createDomain.mutateAsync({
        domain_name: formData.domain_name,
        target_url: formData.target_url,
        is_active: formData.is_active,
        ssl_enabled: formData.ssl_enabled,
        cache_enabled: formData.cache_enabled,
      });

      // Deploy the worker
      setDeploymentStatus('Deploying Cloudflare Worker...');
      
      const deployResult = await deployWorker.mutateAsync({
        domainId: newDomain.id,
        cloudflareAccountId: formData.cloudflare_account_id,
      });

      if (deployResult.workerDeployed) {
        if (deployResult.routeCreated) {
          toast.success('Domain added and Worker deployed successfully!', {
            description: `Route ${deployResult.routePattern} is now active`,
          });
        } else {
          toast.warning('Domain added, Worker deployed', {
            description: deployResult.message,
          });
        }
      }

      setFormData({
        domain_name: '',
        target_url: '',
        is_active: true,
        ssl_enabled: true,
        cache_enabled: true,
        cloudflare_account_id: '',
      });
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error:', error);
      if (error.message?.includes('duplicate')) {
        setErrors({ domain_name: 'This domain is already registered' });
      } else {
        setErrors({ general: error.message || 'Failed to add domain' });
        toast.error('Failed to add domain', {
          description: error.message,
        });
      }
    } finally {
      setIsSubmitting(false);
      setDeploymentStatus('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add New Domain</DialogTitle>
            <DialogDescription>
              Configure a new domain to mask with your target URL. The Cloudflare Worker will be deployed automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cloudflare_account">Cloudflare Account</Label>
              <Select
                value={formData.cloudflare_account_id}
                onValueChange={(value) => setFormData({ ...formData, cloudflare_account_id: value })}
                disabled={accountsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={accountsLoading ? "Loading accounts..." : "Select Cloudflare account"} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-orange-500" />
                        {account.account_name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.cloudflare_account_id && (
                <p className="text-sm text-destructive">{errors.cloudflare_account_id}</p>
              )}
              {accounts.length === 0 && !accountsLoading && (
                <p className="text-xs text-muted-foreground">
                  No Cloudflare accounts connected. Please add one in Settings first.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="domain_name">Domain Name</Label>
              <Input
                id="domain_name"
                placeholder="example.com"
                value={formData.domain_name}
                onChange={(e) => setFormData({ ...formData, domain_name: e.target.value })}
              />
              {errors.domain_name && (
                <p className="text-sm text-destructive">{errors.domain_name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="target_url">Target URL</Label>
              <Input
                id="target_url"
                placeholder="https://real-site.com"
                value={formData.target_url}
                onChange={(e) => setFormData({ ...formData, target_url: e.target.value })}
              />
              {errors.target_url && (
                <p className="text-sm text-destructive">{errors.target_url}</p>
              )}
              <p className="text-xs text-muted-foreground">
                The actual website content that will be served
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Enable domain masking</p>
              </div>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>SSL Enabled</Label>
                <p className="text-xs text-muted-foreground">Serve over HTTPS</p>
              </div>
              <Switch
                checked={formData.ssl_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, ssl_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Cache Enabled</Label>
                <p className="text-xs text-muted-foreground">Cache static assets</p>
              </div>
              <Switch
                checked={formData.cache_enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, cache_enabled: checked })}
              />
            </div>

            {errors.general && (
              <p className="text-sm text-destructive">{errors.general}</p>
            )}

            {deploymentStatus && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {deploymentStatus}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || accounts.length === 0}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
                </>
              ) : (
                'Add Domain & Deploy'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

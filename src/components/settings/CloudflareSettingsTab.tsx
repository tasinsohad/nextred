import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AddCloudflareAccountDialog } from '@/components/cloudflare/AddCloudflareAccountDialog';
import { CloudflareAccountCard } from '@/components/cloudflare/CloudflareAccountCard';
import { useCloudflareAccounts } from '@/hooks/useCloudflareAccounts';
import { Cloud, Loader2 } from 'lucide-react';

export function CloudflareSettingsTab() {
  const { accounts, isLoading } = useCloudflareAccounts();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <Cloud className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <CardTitle>Cloudflare Accounts</CardTitle>
              <CardDescription>
                Connect multiple Cloudflare accounts for automated DNS and proxy management.
              </CardDescription>
            </div>
          </div>
          <AddCloudflareAccountDialog />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Cloud className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No Cloudflare accounts connected</p>
              <p className="text-sm">Add an account to enable automated DNS management</p>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((account) => (
                <CloudflareAccountCard key={account.id} account={account} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CloudflareAccount, useCloudflareAccounts } from '@/hooks/useCloudflareAccounts';
import { Cloud, Pencil, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CloudflareAccountCardProps {
  account: CloudflareAccount;
}

export function CloudflareAccountCard({ account }: CloudflareAccountCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [accountName, setAccountName] = useState(account.account_name);
  const [email, setEmail] = useState(account.cloudflare_email);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const { updateAccount, deleteAccount } = useCloudflareAccounts();
  const { toast } = useToast();

  const maskedApiKey = account.api_key_encrypted 
    ? `****${atob(account.api_key_encrypted).slice(-4)}`
    : '****';

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await updateAccount.mutateAsync({
        id: account.id,
        account_name: accountName,
        cloudflare_email: email,
        ...(apiKey ? { api_key: apiKey } : {}),
      });
      
      toast({
        title: 'Account updated',
        description: 'Your Cloudflare account has been updated.',
      });
      
      setEditOpen(false);
      setApiKey('');
    } catch (error) {
      toast({
        title: 'Update failed',
        description: error instanceof Error ? error.message : 'Failed to update account',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAccount.mutateAsync(account.id);
      toast({
        title: 'Account deleted',
        description: 'Your Cloudflare account has been removed.',
      });
    } catch (error) {
      toast({
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete account',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <>
      <Card className="border-dashed">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Cloud className="h-5 w-5 text-orange-500" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{account.account_name}</h3>
                  <Badge variant="secondary" className="bg-orange-500/20 text-orange-400 hover:bg-orange-500/30">
                    Cloudflare
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-0.5">
                  <p>Email: {account.cloudflare_email}</p>
                  <p>API Key: {maskedApiKey}</p>
                  {account.account_id && (
                    <p>Account ID: <code className="text-xs bg-secondary px-1 py-0.5 rounded">{account.account_id.slice(0, 12)}...</code></p>
                  )}
                  <p>Created: {formatDate(account.created_at)}</p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Cloudflare Account</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{account.account_name}"? This will remove the connection and any domains linked to this account will need to be reconfigured.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>Edit Cloudflare Account</DialogTitle>
              <DialogDescription>
                Update your Cloudflare account settings.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-accountName">Account Name *</Label>
                <Input
                  id="edit-accountName"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  placeholder="e.g., Main Account"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-email">Cloudflare Email *</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-apiKey">Global API Key</Label>
                <div className="relative">
                  <Input
                    id="edit-apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Leave empty to keep current key"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Find your Global API Key in{' '}
                  <a 
                    href="https://dash.cloudflare.com/profile/api-tokens" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    Cloudflare Dashboard → Profile → API Tokens
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>

              <Alert className="border-amber-500/50 bg-amber-500/10">
                <AlertDescription className="text-sm">
                  <strong>Note:</strong> If you update the API key, credentials will be re-validated.
                </AlertDescription>
              </Alert>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateAccount.isPending}>
                {updateAccount.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

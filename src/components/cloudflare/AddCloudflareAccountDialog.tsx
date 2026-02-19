import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCloudflareAccounts } from '@/hooks/useCloudflareAccounts';
import { Plus, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function AddCloudflareAccountDialog() {
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const { createAccount } = useCloudflareAccounts();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await createAccount.mutateAsync({
        account_name: accountName,
        cloudflare_email: email,
        api_key: apiKey,
      });
      
      toast({
        title: 'Account connected',
        description: 'Your Cloudflare account has been successfully connected.',
      });
      
      setOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Connection failed',
        description: error instanceof Error ? error.message : 'Failed to connect Cloudflare account',
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setAccountName('');
    setEmail('');
    setApiKey('');
    setShowApiKey(false);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Cloudflare Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Cloudflare Account</DialogTitle>
            <DialogDescription>
              Connect your Cloudflare account for automated DNS management.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name *</Label>
              <Input
                id="accountName"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="e.g., Main Account"
                required
              />
              <p className="text-xs text-muted-foreground">
                A friendly name to identify this account
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Cloudflare Email *</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="apiKey">Global API Key *</Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  required
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
                <strong>Note:</strong> Credentials are validated when saving. The Account ID will be automatically fetched from Cloudflare.
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAccount.isPending}>
              {createAccount.isPending ? 'Connecting...' : 'Add Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

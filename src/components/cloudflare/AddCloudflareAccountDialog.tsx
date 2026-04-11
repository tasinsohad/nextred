import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCloudflareAccounts } from '@/hooks/useCloudflareAccounts';
import { Plus, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AddCloudflareAccountDialog() {
  const [open, setOpen] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [cfAccountId, setCfAccountId] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [authType, setAuthType] = useState<'token' | 'global'>('token');
  const [errorDetail, setErrorDetail] = useState('');
  const { createAccount } = useCloudflareAccounts();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorDetail('');
    
    try {
      await createAccount.mutateAsync({
        account_name: accountName,
        cloudflare_email: authType === 'global' ? email : 'api-token@cloudflare',
        api_key: apiKey,
        auth_type: authType,
        accountId: cfAccountId,
      });
      
      toast({
        title: 'Account connected',
        description: 'Your Cloudflare account has been successfully connected.',
      });
      
      setOpen(false);
      resetForm();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to connect Cloudflare account';
      setErrorDetail(msg);
      toast({
        title: 'Connection failed',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setAccountName('');
    setEmail('');
    setApiKey('');
    setCfAccountId('');
    setShowApiKey(false);
    setErrorDetail('');
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
      <DialogContent className="sm:max-w-[475px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Cloudflare Account</DialogTitle>
            <DialogDescription>
              Connect your Cloudflare account using an API Token (recommended) or Global API Key.
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
            </div>

            <Tabs value={authType} onValueChange={(v) => setAuthType(v as 'token' | 'global')}>
              <TabsList className="w-full">
                <TabsTrigger value="token" className="flex-1">API Token (Recommended)</TabsTrigger>
                <TabsTrigger value="global" className="flex-1">Global API Key</TabsTrigger>
              </TabsList>

              <TabsContent value="token" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label htmlFor="apiToken">API Token *</Label>
                  <div className="relative">
                    <Input
                      id="apiToken"
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your API Token"
                      required
                      className="pr-10 font-mono text-sm"
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
                    Create at{' '}
                    <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      Cloudflare → API Tokens <ExternalLink className="h-3 w-3" />
                    </a>
                    {' '}with <strong>Zone:Read</strong>, <strong>DNS:Edit</strong>, and <strong>Page Rules:Edit</strong>.
                  </p>
                </div>
                {apiKey.startsWith('cfat_') && (
                  <div className="space-y-2">
                    <Label htmlFor="cfAccountId">Account ID *</Label>
                    <Input
                      id="cfAccountId"
                      value={cfAccountId}
                      onChange={(e) => setCfAccountId(e.target.value)}
                      placeholder="32-character Account ID"
                      required={apiKey.startsWith('cfat_')}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Account API Tokens require an Account ID. Find it in your Cloudflare dashboard.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="global" className="space-y-3 mt-3">
                <div className="space-y-2">
                  <Label htmlFor="email">Cloudflare Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required={authType === 'global'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="globalKey">Global API Key *</Label>
                  <div className="relative">
                    <Input
                      id="globalKey"
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Global API Key"
                      required
                      className="pr-10 font-mono text-sm"
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
                    Found in{' '}
                    <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                      Cloudflare → Profile → API Tokens → Global API Key
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            {errorDetail && (
              <Alert variant="destructive">
                <AlertDescription className="text-sm">{errorDetail}</AlertDescription>
              </Alert>
            )}

            <Alert className="border-amber-500/50 bg-amber-500/10">
              <AlertDescription className="text-sm">
                <strong>Note:</strong> Credentials are validated against Cloudflare before saving. The Account ID is fetched automatically.
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

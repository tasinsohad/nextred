import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { Copy, ExternalLink, Check, Cloud } from 'lucide-react';
import { CloudflareSettingsTab } from '@/components/settings/CloudflareSettingsTab';

export default function Settings() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (user) {
      supabase
        .from('profiles')
        .select('full_name')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.full_name) setFullName(data.full_name);
        });
    }
  }, [user]);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleUpdateProfile = async () => {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('user_id', user.id);
    setSaving(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </DashboardLayout>
    );
  }

  const cloudflareWorkerCode = `// Cloudflare Worker for Domain Masking
// Deploy this to your Cloudflare account

const DOMAIN_MAPPINGS = {
  // Format: 'masked-domain.com': 'https://target-site.com'
  // Add your domains here or fetch from database
};

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const hostname = url.hostname;
  
  // Get target URL from mappings
  const targetBase = DOMAIN_MAPPINGS[hostname];
  if (!targetBase) {
    return new Response('Domain not configured', { status: 404 });
  }
  
  // Build target URL
  const targetUrl = new URL(url.pathname + url.search, targetBase);
  
  // Clone request with new URL
  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'manual'
  });
  
  // Fetch from target
  let response = await fetch(modifiedRequest);
  
  // Handle redirects
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('Location');
    if (location) {
      const newLocation = rewriteUrl(location, targetBase, hostname);
      response = new Response(response.body, {
        status: response.status,
        headers: { ...response.headers, Location: newLocation }
      });
    }
  }
  
  // Rewrite HTML content
  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('text/html')) {
    let html = await response.text();
    html = rewriteHtml(html, targetBase, hostname);
    return new Response(html, {
      status: response.status,
      headers: { ...response.headers, 'Content-Type': 'text/html' }
    });
  }
  
  return response;
}

function rewriteUrl(url, targetBase, maskedDomain) {
  try {
    const parsed = new URL(url, targetBase);
    if (parsed.hostname === new URL(targetBase).hostname) {
      parsed.hostname = maskedDomain;
      parsed.protocol = 'https:';
      return parsed.toString();
    }
  } catch (e) {}
  return url;
}

function rewriteHtml(html, targetBase, maskedDomain) {
  const targetHost = new URL(targetBase).hostname;
  // Rewrite absolute URLs
  html = html.replace(new RegExp(targetHost, 'g'), maskedDomain);
  // Rewrite src/href attributes
  html = html.replace(/src=["']\\//g, \`src="/\`);
  html = html.replace(/href=["']\\//g, \`href="/\`);
  return html;
}`;

  const nginxConfig = `# Nginx Reverse Proxy Configuration for Domain Masking

# Server block for masked domain
server {
    listen 80;
    listen 443 ssl http2;
    server_name masked-domain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/masked-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/masked-domain.com/privkey.pem;

    location / {
        # Proxy to target site
        proxy_pass https://target-site.com;
        
        # Preserve Host header
        proxy_set_header Host target-site.com;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Handle WebSocket connections
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Rewrite response headers
        proxy_redirect https://target-site.com/ https://masked-domain.com/;
        
        # Rewrite HTML content
        sub_filter 'target-site.com' 'masked-domain.com';
        sub_filter_once off;
        sub_filter_types text/html text/css text/javascript application/javascript;
    }
}`;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Manage your account and get setup instructions</p>
        </div>

        <Tabs defaultValue="account" className="w-full">
          <TabsList>
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="cloudflare" className="gap-2">
              <Cloud className="h-4 w-4" />
              Cloudflare
            </TabsTrigger>
            <TabsTrigger value="setup">Setup Guide</TabsTrigger>
            <TabsTrigger value="code">Code Snippets</TabsTrigger>
          </TabsList>

          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Update your account information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={user?.email || ''} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your name"
                  />
                </div>
                <Button onClick={handleUpdateProfile} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cloudflare" className="space-y-6">
            <CloudflareSettingsTab />
          </TabsContent>

          <TabsContent value="setup" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>DNS Setup</CardTitle>
                <CardDescription>Configure your domain's DNS to point to the proxy</CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="cloudflare">
                    <AccordionTrigger>Cloudflare Workers (Recommended)</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Create a Cloudflare account and add your domain</li>
                        <li>Go to Workers & Pages → Create Worker</li>
                        <li>Copy the Worker code from the "Code Snippets" tab</li>
                        <li>Add your domain mappings to the DOMAIN_MAPPINGS object</li>
                        <li>Go to Worker Settings → Triggers → Add Route</li>
                        <li>Set route to: <code className="px-1 py-0.5 bg-secondary">*.yourdomain.com/*</code></li>
                        <li>Deploy the worker</li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="nginx">
                    <AccordionTrigger>Nginx Reverse Proxy</AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Set up a VPS with Nginx installed</li>
                        <li>Point your domain's A record to your server's IP</li>
                        <li>Install Certbot for SSL: <code className="px-1 py-0.5 bg-secondary">certbot --nginx</code></li>
                        <li>Copy the Nginx config from "Code Snippets" tab</li>
                        <li>Replace domain names in the config</li>
                        <li>Test config: <code className="px-1 py-0.5 bg-secondary">nginx -t</code></li>
                        <li>Reload: <code className="px-1 py-0.5 bg-secondary">nginx -s reload</code></li>
                      </ol>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="dns">
                    <AccordionTrigger>DNS Records</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 text-sm">
                        <p>For Cloudflare Workers, use these DNS settings:</p>
                        <div className="bg-secondary p-4 font-mono text-xs">
                          <p>Type: A</p>
                          <p>Name: @</p>
                          <p>Value: 192.0.2.1 (placeholder)</p>
                          <p>Proxy: Enabled (orange cloud)</p>
                        </div>
                        <p className="text-muted-foreground">
                          The actual IP doesn't matter when using Cloudflare Workers - 
                          the worker intercepts all requests.
                        </p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="code" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Cloudflare Worker</CardTitle>
                  <CardDescription>JavaScript code for Cloudflare Workers</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(cloudflareWorkerCode, 'worker')}
                >
                  {copied === 'worker' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  Copy
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="bg-secondary p-4 overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                  {cloudflareWorkerCode}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Nginx Configuration</CardTitle>
                  <CardDescription>Reverse proxy configuration for Nginx</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(nginxConfig, 'nginx')}
                >
                  {copied === 'nginx' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  Copy
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="bg-secondary p-4 overflow-x-auto text-xs font-mono max-h-[400px] overflow-y-auto">
                  {nginxConfig}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Integration</CardTitle>
                <CardDescription>Fetch domain mappings from your database</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  To dynamically fetch domain mappings, create an edge function that returns your domains:
                </p>
                <div className="flex items-center gap-2">
                  <code className="px-2 py-1 bg-secondary text-sm font-mono flex-1 truncate">
                    GET /functions/v1/get-domain-mappings
                  </code>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://docs.lovable.dev/features/cloud" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Docs
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

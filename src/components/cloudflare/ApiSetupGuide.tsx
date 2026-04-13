import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, ChevronDown, ChevronUp, BookOpen, Key, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

type FeatureType = 'redirect_rules' | 'bulk_redirects' | 'subdomain_redirects';

const FEATURE_CONFIG: Record<FeatureType, {
  title: string;
  method: string;
  permissions: { name: string; description: string }[];
  howItWorks: string;
}> = {
  redirect_rules: {
    title: 'Redirect Rules (Ruleset Engine)',
    method: 'Uses Cloudflare\'s Ruleset Engine to create dynamic redirect rules. Supports up to 10 rules on the free plan per zone, each rule can match multiple hostnames.',
    permissions: [
      { name: 'Zone:Zone:Read', description: 'Allows searching for zone IDs from domain names.' },
      { name: 'Zone:DNS:Edit', description: 'Allows creating/updating A records (192.0.2.1) to proxy traffic through Cloudflare.' },
      { name: 'Zone:Dynamic Redirect:Edit', description: 'Required to deploy redirect rules via the Ruleset Engine. This is different from Page Rules.' },
    ],
    howItWorks: 'This page creates a single redirect rule per zone that matches all entered hostnames using expressions like (http.host eq "example.com"). Traffic is redirected using Cloudflare\'s Ruleset Engine — no Page Rules consumed.',
  },
  bulk_redirects: {
    title: 'Bulk Redirects (Page Rules)',
    method: 'Uses Cloudflare Page Rules to create individual forwarding URL rules per domain/subdomain. Each redirect consumes one Page Rule (3 free per zone on Cloudflare free plan).',
    permissions: [
      { name: 'Zone:Zone:Read', description: 'Allows searching for zone IDs from domain names.' },
      { name: 'Zone:DNS:Edit', description: 'Allows creating/updating proxied A records for subdomains.' },
      { name: 'Zone:Page Rules:Edit', description: 'Required to create/update forwarding URL page rules.' },
    ],
    howItWorks: 'For each entry, a proxied A record (192.0.2.1) is created if missing, then a Page Rule with "Forwarding URL" action is deployed. Existing rules are updated in place.',
  },
  subdomain_redirects: {
    title: 'Subdomain Redirects (Page Rules)',
    method: 'Uses Cloudflare Page Rules to redirect subdomains. Similar to Bulk Redirects but specifically designed for subdomain-level redirects.',
    permissions: [
      { name: 'Zone:Zone:Read', description: 'Allows searching for zone IDs from domain names.' },
      { name: 'Zone:DNS:Edit', description: 'Allows creating/updating proxied A records for subdomains.' },
      { name: 'Zone:Page Rules:Edit', description: 'Required to create/update forwarding URL page rules for subdomains.' },
    ],
    howItWorks: 'Each subdomain gets a proxied A record pointing to 192.0.2.1, then a Page Rule is created to forward traffic. Existing A records and Page Rules are detected and updated.',
  },
};

export function ApiSetupGuide({ feature }: { feature: FeatureType }) {
  const [open, setOpen] = useState(false);
  const config = FEATURE_CONFIG[feature];

  return (
    <Card className="mb-6 border-dashed">
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            How to configure your Cloudflare API for this page
          </span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-4 text-sm">
          {/* What this page does */}
          <div>
            <h4 className="font-semibold flex items-center gap-1.5 mb-1">
              <Shield className="h-3.5 w-3.5 text-primary" />
              {config.title}
            </h4>
            <p className="text-muted-foreground">{config.method}</p>
          </div>

          {/* How it works */}
          <div>
            <h4 className="font-semibold mb-1">How it works</h4>
            <p className="text-muted-foreground">{config.howItWorks}</p>
          </div>

          {/* Required permissions */}
          <div>
            <h4 className="font-semibold flex items-center gap-1.5 mb-2">
              <Key className="h-3.5 w-3.5 text-primary" />
              Required API Token Permissions
            </h4>
            <div className="space-y-2">
              {config.permissions.map((perm) => (
                <div key={perm.name} className="flex items-start gap-2 pl-2 border-l-2 border-primary/30">
                  <Badge variant="secondary" className="font-mono text-xs shrink-0 mt-0.5">{perm.name}</Badge>
                  <span className="text-muted-foreground">{perm.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Token types */}
          <div className="bg-muted/50 rounded-md p-3 space-y-2">
            <h4 className="font-semibold">Supported credential types</h4>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>
                <strong className="text-foreground">API Token</strong> (recommended) — Scoped token created at{' '}
                <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                  Cloudflare Dashboard <ExternalLink className="h-3 w-3" />
                </a>. Use "Custom token" and add the permissions listed above.
              </li>
              <li>
                <strong className="text-foreground">Account API Token</strong> (starts with <code className="bg-muted px-1 rounded">cfat_</code>) — Requires you to also provide your 32-character Account ID, found on your Cloudflare dashboard overview page.
              </li>
              <li>
                <strong className="text-foreground">Global API Key</strong> — Found in Profile → API Tokens → Global API Key. Requires your Cloudflare email. Has full access but less secure than scoped tokens.
              </li>
            </ul>
          </div>

          {/* Step by step */}
          <div>
            <h4 className="font-semibold mb-2">Quick setup steps</h4>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Go to <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Cloudflare API Tokens</a></li>
              <li>Click <strong>"Create Token"</strong> → <strong>"Create Custom Token"</strong></li>
              <li>Add the permissions: {config.permissions.map((p) => p.name).join(', ')}</li>
              <li>Set Zone Resources to "All zones" or specific zones you want to manage</li>
              <li>Create the token and paste it above</li>
              <li>If your token starts with <code className="bg-muted px-1 rounded">cfat_</code>, also enter your Account ID</li>
            </ol>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

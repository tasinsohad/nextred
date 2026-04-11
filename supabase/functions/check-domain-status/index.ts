import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface StatusResult {
  domain: string;
  targetUrl: string;
  checks: {
    configApi: { success: boolean; message: string; latency?: number };
    workerResponse: { success: boolean; message: string; latency?: number; statusCode?: number };
    contentRewrite: { success: boolean; message: string };
  };
  overall: 'healthy' | 'partial' | 'error';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;
    const { domainId } = await req.json();

    if (!domainId) {
      return new Response(
        JSON.stringify({ error: 'Domain ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch domain and verify ownership
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: domain, error: domainError } = await serviceSupabase
      .from('domains')
      .select('*')
      .eq('id', domainId)
      .eq('user_id', userId)
      .single();

    if (domainError || !domain) {
      return new Response(
        JSON.stringify({ error: 'Domain not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result: StatusResult = {
      domain: domain.domain_name,
      targetUrl: domain.target_url,
      checks: {
        configApi: { success: false, message: '' },
        workerResponse: { success: false, message: '' },
        contentRewrite: { success: false, message: '' },
      },
      overall: 'error',
    };

    // Check 1: Config API
    try {
      const configStart = Date.now();
      const configResponse = await fetch(
        `${supabaseUrl}/functions/v1/get-domain-config?domain=${encodeURIComponent(domain.domain_name)}`,
        {
          headers: {
            'apikey': supabaseAnonKey,
            'Content-Type': 'application/json',
          },
        }
      );
      const configLatency = Date.now() - configStart;

      if (configResponse.ok) {
        const configData = await configResponse.json();
        if (configData.success && configData.config) {
          result.checks.configApi = {
            success: true,
            message: `Config API working (${configLatency}ms)`,
            latency: configLatency,
          };
        } else {
          result.checks.configApi = {
            success: false,
            message: 'Config API returned no data',
            latency: configLatency,
          };
        }
      } else {
        result.checks.configApi = {
          success: false,
          message: `Config API returned ${configResponse.status}`,
          latency: configLatency,
        };
      }
    } catch (e) {
      result.checks.configApi = {
        success: false,
        message: `Config API error: ${e instanceof Error ? e.message : 'Unknown'}`,
      };
    }

    // Check 2: Worker Response (try to fetch the domain)
    try {
      const workerStart = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const workerResponse = await fetch(`https://${domain.domain_name}/`, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'DomainMaskPro-StatusChecker/1.0',
        },
      });
      clearTimeout(timeout);
      const workerLatency = Date.now() - workerStart;

      if (workerResponse.ok || workerResponse.status === 301 || workerResponse.status === 302) {
        result.checks.workerResponse = {
          success: true,
          message: `Worker responding (${workerLatency}ms)`,
          latency: workerLatency,
          statusCode: workerResponse.status,
        };

        // Check 3: Content rewrite - look for signs the worker is active
        const server = workerResponse.headers.get('server') || '';
        const cfRay = workerResponse.headers.get('cf-ray') || '';
        
        if (cfRay) {
          result.checks.contentRewrite = {
            success: true,
            message: 'Cloudflare proxy detected',
          };
        } else {
          result.checks.contentRewrite = {
            success: false,
            message: 'Cloudflare proxy not detected - check DNS settings',
          };
        }
      } else if (workerResponse.status === 404) {
        const text = await workerResponse.text();
        if (text.includes('Domain mapping not found')) {
          result.checks.workerResponse = {
            success: false,
            message: 'Worker active but domain not in config',
            statusCode: 404,
          };
        } else {
          result.checks.workerResponse = {
            success: false,
            message: `Domain returned 404`,
            statusCode: 404,
          };
        }
      } else {
        result.checks.workerResponse = {
          success: false,
          message: `Domain returned ${workerResponse.status}`,
          statusCode: workerResponse.status,
          latency: workerLatency,
        };
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        result.checks.workerResponse = {
          success: false,
          message: 'Request timed out - DNS may not be configured',
        };
      } else {
        result.checks.workerResponse = {
          success: false,
          message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown'}`,
        };
      }
      result.checks.contentRewrite = {
        success: false,
        message: 'Cannot check - domain unreachable',
      };
    }

    // Determine overall status
    const successCount = [
      result.checks.configApi.success,
      result.checks.workerResponse.success,
      result.checks.contentRewrite.success,
    ].filter(Boolean).length;

    if (successCount === 3) {
      result.overall = 'healthy';
    } else if (successCount >= 1) {
      result.overall = 'partial';
    } else {
      result.overall = 'error';
    }

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking domain status:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

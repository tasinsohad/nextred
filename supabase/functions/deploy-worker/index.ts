import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Dynamic Worker script that fetches config from our API
const generateWorkerScript = (supabaseUrl: string, supabaseAnonKey: string) => `
// Domain Mask Pro - Dynamic Cloudflare Worker
// Fetches domain configuration from database in real-time

const SUPABASE_URL = '${supabaseUrl}';
const SUPABASE_ANON_KEY = '${supabaseAnonKey}';
const CONFIG_ENDPOINT = '${supabaseUrl}/functions/v1/get-domain-config';

// Cache for domain configs (5 minute TTL)
const configCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getDomainConfig(hostname) {
  const cached = configCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.config;
  }

  try {
    const response = await fetch(CONFIG_ENDPOINT + '?domain=' + encodeURIComponent(hostname), {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch config for', hostname);
      return null;
    }

    const data = await response.json();
    if (data.success && data.config) {
      configCache.set(hostname, { config: data.config, timestamp: Date.now() });
      return data.config;
    }
  } catch (error) {
    console.error('Error fetching domain config:', error);
  }
  return null;
}

async function logTraffic(domainId, request) {
  try {
    const url = new URL(request.url);
    const cfData = request.cf || {};
    
    await fetch(SUPABASE_URL + '/rest/v1/traffic_logs', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        domain_id: domainId,
        visitor_ip: request.headers.get('CF-Connecting-IP'),
        user_agent: request.headers.get('User-Agent'),
        request_path: url.pathname + url.search,
        referer: request.headers.get('Referer'),
        country_code: cfData.country || null,
        utm_source: url.searchParams.get('utm_source'),
        utm_medium: url.searchParams.get('utm_medium'),
        utm_campaign: url.searchParams.get('utm_campaign'),
        utm_term: url.searchParams.get('utm_term'),
        utm_content: url.searchParams.get('utm_content'),
        fbclid: url.searchParams.get('fbclid'),
        gclid: url.searchParams.get('gclid'),
      }),
    });
  } catch (e) {
    console.error('Failed to log traffic:', e);
  }
}

// Rewrite Location header to use masked domain
function replaceLocationHeader(headers, originHost, maskedHost) {
  const loc = headers.get("Location");
  if (!loc) return;
  const replaced = loc.replace(new RegExp(originHost, "gi"), maskedHost);
  headers.set("Location", replaced);
}

// Rewrite Set-Cookie headers to fix domain attributes
function rewriteSetCookieHeaders(rawHeaders, originHost, maskedHost) {
  const out = new Headers();
  for (const [k, v] of rawHeaders.entries()) {
    if (k.toLowerCase() === "set-cookie") {
      let fixed = v;
      // Replace domain attributes with masked domain
      fixed = fixed.replace(new RegExp("Domain=\\\\.?" + originHost, "ig"), "Domain=" + maskedHost);
      // Strip any remaining Domain attributes that contain the origin
      fixed = fixed.replace(/Domain=[^;]+/ig, (match) => {
        if (match.toLowerCase().includes(originHost.toLowerCase())) {
          return "";
        }
        return match;
      });
      out.append("Set-Cookie", fixed);
    } else {
      out.set(k, v);
    }
  }
  return out;
}

// Transform HTML content to replace origin hostname with masked hostname
async function handleHTMLTransform(response, originHost, maskedHost) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  const text = await response.text();
  const replaced = text.split(originHost).join(maskedHost);

  const newHeaders = new Headers(response.headers);
  newHeaders.set("Content-Length", String(new TextEncoder().encode(replaced).length));

  return new Response(replaced, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

// Fetch from origin with modified headers
async function fetchOrigin(request, originHost) {
  const url = new URL(request.url);
  url.hostname = originHost;

  const newHeaders = new Headers(request.headers);
  newHeaders.set("Host", originHost);

  // Rewrite Origin header if present
  const origin = newHeaders.get("Origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      originUrl.hostname = originHost;
      newHeaders.set("Origin", originUrl.origin);
    } catch (e) {}
  }

  // Rewrite Referer header if present
  const referer = newHeaders.get("Referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      refererUrl.hostname = originHost;
      newHeaders.set("Referer", refererUrl.toString());
    } catch (e) {
      newHeaders.delete("Referer");
    }
  }

  // Remove CF headers
  newHeaders.delete("CF-Connecting-IP");
  newHeaders.delete("CF-RAY");
  newHeaders.delete("CF-Visitor");

  const newReq = new Request(url.toString(), {
    method: request.method,
    headers: newHeaders,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : null,
    redirect: "manual",
  });

  return fetch(newReq);
}

async function handleRequest(request) {
  const maskedHost = new URL(request.url).hostname;
  
  // Get dynamic config for this domain
  const config = await getDomainConfig(maskedHost);
  
  if (!config) {
    return new Response("Domain mapping not found for: " + maskedHost, {
      status: 404,
      headers: { "Content-Type": "text/plain" }
    });
  }

  const originUrl = new URL(config.targetUrl);
  const originHost = originUrl.hostname;

  // Log traffic asynchronously
  logTraffic(config.domainId, request);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const originResp = await fetchOrigin(request, originHost);

  // Process Set-Cookie headers
  const reconstructed = rewriteSetCookieHeaders(originResp.headers, originHost, maskedHost);

  const contentType = originResp.headers.get("Content-Type") || "";

  // For non-HTML responses, just fix headers and return
  if (!contentType.includes("text/html")) {
    for (const [k, v] of originResp.headers.entries()) {
      if (k.toLowerCase() !== "set-cookie") reconstructed.set(k, v);
    }

    // Fix Location header for redirects
    if (originResp.headers.get("Location")) {
      const loc = originResp.headers.get("Location");
      reconstructed.set("Location", loc.replace(new RegExp(originHost, "gi"), maskedHost));
    }

    // Remove headers that cause issues with proxying
    reconstructed.delete("content-encoding");

    // Add CORS headers
    reconstructed.set("Access-Control-Allow-Origin", "*");

    // Add cache headers if enabled
    if (config.cacheEnabled) {
      const cacheableTypes = ["image/", "font/", "text/css", "application/javascript"];
      if (cacheableTypes.some(type => contentType.includes(type))) {
        reconstructed.set("Cache-Control", "public, max-age=86400");
      }
    }

    const body = await originResp.arrayBuffer();
    return new Response(body, {
      status: originResp.status,
      statusText: originResp.statusText,
      headers: reconstructed,
    });
  }

  // For HTML responses, transform content to replace origin with masked host
  const htmlResponse = await handleHTMLTransform(originResp, originHost, maskedHost);
  const finalHeaders = new Headers(htmlResponse.headers);

  // Merge in the rewritten Set-Cookie headers
  for (const [k, v] of reconstructed.entries()) {
    if (k.toLowerCase() === "set-cookie") finalHeaders.append(k, v);
    else finalHeaders.set(k, v);
  }

  // Fix Location header if present
  replaceLocationHeader(finalHeaders, originHost, maskedHost);

  // Remove headers that cause issues
  finalHeaders.delete("content-encoding");
  finalHeaders.delete("Content-Security-Policy");
  finalHeaders.delete("X-Frame-Options");

  // Add CORS headers
  finalHeaders.set("Access-Control-Allow-Origin", "*");

  return new Response(await htmlResponse.text(), {
    status: htmlResponse.status,
    statusText: htmlResponse.statusText,
    headers: finalHeaders,
  });
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
`;

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

    const { domainId, cloudflareAccountId } = await req.json();

    if (!domainId || !cloudflareAccountId) {
      return new Response(
        JSON.stringify({ error: 'Domain ID and Cloudflare Account ID required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to fetch data
    const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch domain and verify ownership
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

    // Fetch Cloudflare account and verify ownership
    const { data: cfAccount, error: cfError } = await serviceSupabase
      .from('cloudflare_accounts')
      .select('*')
      .eq('id', cloudflareAccountId)
      .eq('user_id', userId)
      .single();

    if (cfError || !cfAccount) {
      return new Response(
        JSON.stringify({ error: 'Cloudflare account not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt API key (base64 for now)
    const apiKey = atob(cfAccount.api_key_encrypted);
    const cfEmail = cfAccount.cloudflare_email;
    const cfAccountId = cfAccount.account_id;

    if (!cfAccountId) {
      return new Response(
        JSON.stringify({ error: 'Cloudflare account ID not set' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const workerName = `domain-mask-${domain.domain_name.replace(/\./g, '-')}`;

    // Generate the worker script
    const workerScript = generateWorkerScript(supabaseUrl, supabaseAnonKey);

    // Step 1: Upload the Worker script
    console.log(`Deploying worker: ${workerName}`);
    
    const uploadResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/workers/scripts/${workerName}`,
      {
        method: 'PUT',
        headers: {
          'X-Auth-Email': cfEmail,
          'X-Auth-Key': apiKey,
          'Content-Type': 'application/javascript',
        },
        body: workerScript,
      }
    );

    const uploadResult = await uploadResponse.json();

    if (!uploadResult.success) {
      console.error('Worker upload failed:', uploadResult);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to upload worker', 
          details: uploadResult.errors?.[0]?.message || 'Unknown error' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Worker uploaded successfully');

    // Step 2: Get zones to find the domain's zone
    const zonesResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${domain.domain_name}`,
      {
        headers: {
          'X-Auth-Email': cfEmail,
          'X-Auth-Key': apiKey,
        },
      }
    );

    const zonesResult = await zonesResponse.json();
    let zoneId = null;

    if (zonesResult.success && zonesResult.result?.length > 0) {
      zoneId = zonesResult.result[0].id;
    } else {
      // Try to find parent domain zone
      const domainParts = domain.domain_name.split('.');
      for (let i = 1; i < domainParts.length - 1; i++) {
        const parentDomain = domainParts.slice(i).join('.');
        const parentZonesResponse = await fetch(
          `https://api.cloudflare.com/client/v4/zones?name=${parentDomain}`,
          {
            headers: {
              'X-Auth-Email': cfEmail,
              'X-Auth-Key': apiKey,
            },
          }
        );
        const parentZonesResult = await parentZonesResponse.json();
        if (parentZonesResult.success && parentZonesResult.result?.length > 0) {
          zoneId = parentZonesResult.result[0].id;
          break;
        }
      }
    }

    if (!zoneId) {
      // Update domain with cloudflare account but note zone not found
      await serviceSupabase
        .from('domains')
        .update({ cloudflare_account_id: cloudflareAccountId })
        .eq('id', domainId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          workerDeployed: true,
          routeCreated: false,
          message: 'Worker deployed but zone not found. Please add the domain to Cloudflare first and create the route manually.',
          workerName,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Create worker route
    const routePattern = `${domain.domain_name}/*`;
    
    // First check if route already exists
    const existingRoutesResponse = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
      {
        headers: {
          'X-Auth-Email': cfEmail,
          'X-Auth-Key': apiKey,
        },
      }
    );

    const existingRoutes = await existingRoutesResponse.json();
    let routeExists = false;
    let existingRouteId = null;

    if (existingRoutes.success) {
      const matchingRoute = existingRoutes.result?.find(
        (r: any) => r.pattern === routePattern || r.pattern === `*${domain.domain_name}/*`
      );
      if (matchingRoute) {
        routeExists = true;
        existingRouteId = matchingRoute.id;
      }
    }

    let routeResult;
    if (routeExists && existingRouteId) {
      // Update existing route
      const updateRouteResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes/${existingRouteId}`,
        {
          method: 'PUT',
          headers: {
            'X-Auth-Email': cfEmail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pattern: routePattern,
            script: workerName,
          }),
        }
      );
      routeResult = await updateRouteResponse.json();
    } else {
      // Create new route
      const createRouteResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
        {
          method: 'POST',
          headers: {
            'X-Auth-Email': cfEmail,
            'X-Auth-Key': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pattern: routePattern,
            script: workerName,
          }),
        }
      );
      routeResult = await createRouteResponse.json();
    }

    if (!routeResult.success) {
      console.error('Route creation failed:', routeResult);
      
      // Still update domain with cloudflare account
      await serviceSupabase
        .from('domains')
        .update({ cloudflare_account_id: cloudflareAccountId })
        .eq('id', domainId);

      return new Response(
        JSON.stringify({ 
          success: true,
          workerDeployed: true,
          routeCreated: false,
          message: 'Worker deployed but route creation failed: ' + (routeResult.errors?.[0]?.message || 'Unknown error'),
          workerName,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update domain with cloudflare account
    await serviceSupabase
      .from('domains')
      .update({ cloudflare_account_id: cloudflareAccountId })
      .eq('id', domainId);

    console.log('Route created successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        workerDeployed: true,
        routeCreated: true,
        message: 'Worker deployed and route created successfully',
        workerName,
        routePattern,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error deploying worker:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

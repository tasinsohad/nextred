import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CF_BASE = "https://api.cloudflare.com/client/v4";

function cfHeaders(apiToken: string) {
  return {
    "Authorization": `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
}

async function cfFetch(apiToken: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...options,
    headers: { ...cfHeaders(apiToken), ...(options.headers || {}) },
  });
  return await res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, apiToken, accountId, zoneId, data } = body;

    if (!action || !apiToken) {
      return new Response(
        JSON.stringify({ success: false, error: "action and apiToken are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: unknown;

    switch (action) {
      // Validate token & get account info
      case "verify-token": {
        const r = await cfFetch(apiToken, "/user/tokens/verify");
        result = { success: r.success, errors: r.errors };
        break;
      }

      // List all zones in an account (paginated, up to 500)
      case "list-zones": {
        const page1 = await cfFetch(apiToken, `/zones?account.id=${accountId}&per_page=50&page=1&status=active`);
        if (!page1.success) {
          result = { success: false, errors: page1.errors };
          break;
        }
        const totalPages = page1.result_info?.total_pages ?? 1;
        let zones = page1.result ?? [];
        const pagePromises = [];
        for (let p = 2; p <= Math.min(totalPages, 10); p++) {
          pagePromises.push(cfFetch(apiToken, `/zones?account.id=${accountId}&per_page=50&page=${p}&status=active`));
        }
        const extraPages = await Promise.all(pagePromises);
        for (const ep of extraPages) {
          if (ep.success) zones = zones.concat(ep.result ?? []);
        }
        result = { success: true, zones: zones.map((z: { id: string; name: string; status: string }) => ({ id: z.id, name: z.name, status: z.status })) };
        break;
      }

      // Get DNS records for a zone
      case "get-dns-records": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records?per_page=100`);
        result = { success: r.success, records: r.result, errors: r.errors };
        break;
      }

      // Create a DNS record
      case "create-dns-record": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        result = { success: r.success, record: r.result, errors: r.errors };
        break;
      }

      // Update a DNS record
      case "update-dns-record": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records/${data.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        result = { success: r.success, record: r.result, errors: r.errors };
        break;
      }

      // Delete a DNS record
      case "delete-dns-record": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records/${data.id}`, {
          method: "DELETE",
        });
        result = { success: r.success, errors: r.errors };
        break;
      }

      // List page rules for a zone
      case "get-page-rules": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/pagerules?status=active`);
        result = { success: r.success, rules: r.result, errors: r.errors };
        break;
      }

      // Update a page rule
      case "update-page-rule": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/pagerules/${data.id}`, {
          method: "PATCH",
          body: JSON.stringify(data.payload),
        });
        result = { success: r.success, rule: r.result, errors: r.errors };
        break;
      }

      // Create a page rule (redirect)
      case "create-page-rule": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/pagerules`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        result = { success: r.success, rule: r.result, errors: r.errors };
        break;
      }

      // Delete page rules for a zone (all redirect rules)
      case "delete-page-rules": {
        // data.ids = array of rule IDs to delete
        const deleteResults = await Promise.all(
          (data.ids as string[]).map((id: string) =>
            cfFetch(apiToken, `/zones/${zoneId}/pagerules/${id}`, { method: "DELETE" })
          )
        );
        result = { success: true, deleted: deleteResults };
        break;
      }

      // Create bulk redirect via Ruleset API (single redirect rule)
      case "create-redirect-ruleset": {
        const { targetUrl, redirectType, domainName } = data as {
          targetUrl: string;
          redirectType: "301" | "302";
          domainName: string;
        };
        const statusCode = parseInt(redirectType, 10);

        const rulesetsRes = await cfFetch(apiToken, `/zones/${zoneId}/rulesets`);
        const existingRedirectRuleset = (rulesetsRes.result ?? []).find(
          (rs: { phase: string }) => rs.phase === "http_request_dynamic_redirect"
        );

        const rulePayload = {
          description: `Bulk redirect for ${domainName}`,
          expression: `(http.host eq "${domainName}" or http.host eq "www.${domainName}")`,
          action: "redirect",
          action_parameters: {
            from_value: {
              status_code: statusCode,
              target_url: { value: targetUrl },
              preserve_query_string: true,
            },
          },
        };

        let createResult;
        if (existingRedirectRuleset) {
          const currentRuleset = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/${existingRedirectRuleset.id}`);
          const existingRules = currentRuleset.result?.rules ?? [];
          const filteredRules = existingRules.filter(
            (r: { description?: string }) => !r.description?.includes(`for ${domainName}`)
          );
          createResult = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/${existingRedirectRuleset.id}`, {
            method: "PUT",
            body: JSON.stringify({ rules: [...filteredRules, rulePayload] }),
          });
        } else {
          createResult = await cfFetch(apiToken, `/zones/${zoneId}/rulesets`, {
            method: "POST",
            body: JSON.stringify({
              name: "Bulk Redirect Rules",
              kind: "zone",
              phase: "http_request_dynamic_redirect",
              rules: [rulePayload],
            }),
          });
        }
        result = { success: createResult.success, errors: createResult.errors };
        break;
      }

      // Get zone info
      case "get-zone-info": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}`);
        result = { success: r.success, zone: r.result, errors: r.errors };
        break;
      }

      // Get redirect ruleset entrypoint
      case "get-redirect-ruleset": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
        result = { success: r.success, ruleset: r.result, errors: r.errors };
        break;
      }

      // Deploy full redirect ruleset via PUT entrypoint (or create if none exists)
      case "deploy-redirect-ruleset": {
        // data.rules = array of rule objects to deploy
        // First try PUT to entrypoint
        let r = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, {
          method: "PUT",
          body: JSON.stringify({ rules: data.rules }),
        });
        // If entrypoint doesn't exist yet, create a new ruleset via POST
        if (!r.success) {
          const notFound = (r.errors ?? []).some((e: { code?: number; message?: string }) =>
            e.code === 10009 || (e.message ?? "").toLowerCase().includes("not found")
          );
          if (notFound) {
            r = await cfFetch(apiToken, `/zones/${zoneId}/rulesets`, {
              method: "POST",
              body: JSON.stringify({
                name: "Subdomain Redirect Rules",
                kind: "zone",
                phase: "http_request_dynamic_redirect",
                rules: data.rules,
              }),
            });
          }
        }
        result = { success: r.success, ruleset: r.result, errors: r.errors };
        break;
      }

      // Search zones by name (to auto-detect zone ID from domain)
      case "search-zones": {
        const { domainName } = data as { domainName: string };
        const r = await cfFetch(apiToken, `/zones?name=${encodeURIComponent(domainName)}&status=active`);
        result = { success: r.success, zones: r.result, errors: r.errors };
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("cloudflare-bulk-proxy error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

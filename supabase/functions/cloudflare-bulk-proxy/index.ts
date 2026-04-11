import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CF_BASE = "https://api.cloudflare.com/client/v4";

function normalizeApiToken(apiToken: string) {
  return apiToken.trim().replace(/^Bearer\s+/i, "").trim();
}

function cfHeaders(apiToken: string) {
  const normalizedToken = normalizeApiToken(apiToken);
  return {
    "Authorization": `Bearer ${normalizedToken}`,
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

    if (!action || !normalizeApiToken(apiToken)) {
      return new Response(
        JSON.stringify({ success: false, error: "action and apiToken are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: unknown;

    switch (action) {
      // ─── Token & Zone Actions ───────────────────────────────────────
      case "verify-token": {
        const normalizedToken = normalizeApiToken(apiToken);
        // Account API Tokens (starting with cfat_) must be verified via the account-specific endpoint
        const isAccountToken = normalizedToken.startsWith("cfat_");
        const verifyPath = (isAccountToken && accountId) 
          ? `/accounts/${accountId}/tokens/verify` 
          : "/user/tokens/verify";
        
        const r = await cfFetch(apiToken, verifyPath);
        if (!r.success) {
          const errMsg = r.errors?.[0]?.message || "Token verification failed";
          const docUrl = r.errors?.[0]?.documentation_url ? ` See ${r.errors[0].documentation_url}` : "";
          result = { 
            success: false, 
            errors: r.errors,
            detail: `Cloudflare rejected the token: ${errMsg}.${docUrl} If you copied the Authorization header value, remove the leading "Bearer " and paste only the token. Ensure your API Token has necessary permissions (Zone:Read, DNS:Edit, Page Rules:Edit).`
          };
        } else {
          const tokenStatus = r.result?.status;
          if (tokenStatus && tokenStatus !== "active") {
            result = {
              success: false,
              detail: `Cloudflare reports this token is ${tokenStatus}. Enable it or create a new active token.`,
            };
          } else {
            result = { success: true, status: tokenStatus };
          }
        }
        break;
      }

      case "list-zones": {
        const page1 = await cfFetch(apiToken, `/zones?account.id=${accountId}&per_page=50&page=1&status=active`);
        if (!page1.success) { result = { success: false, errors: page1.errors }; break; }
        const totalPages = page1.result_info?.total_pages ?? 1;
        let zones = page1.result ?? [];
        const pagePromises = [];
        for (let p = 2; p <= Math.min(totalPages, 10); p++) {
          pagePromises.push(cfFetch(apiToken, `/zones?account.id=${accountId}&per_page=50&page=${p}&status=active`));
        }
        const extraPages = await Promise.all(pagePromises);
        for (const ep of extraPages) { if (ep.success) zones = zones.concat(ep.result ?? []); }
        result = { success: true, zones: zones.map((z: { id: string; name: string; status: string }) => ({ id: z.id, name: z.name, status: z.status })) };
        break;
      }

      case "search-zones": {
        const { domainName } = data as { domainName: string };
        const r = await cfFetch(apiToken, `/zones?name=${encodeURIComponent(domainName)}&status=active`);
        result = { success: r.success, zones: r.result, errors: r.errors };
        break;
      }

      case "get-zone-info": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}`);
        result = { success: r.success, zone: r.result, errors: r.errors };
        break;
      }

      // ─── DNS Actions ────────────────────────────────────────────────
      case "get-dns-records": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records?per_page=100`);
        result = { success: r.success, records: r.result, errors: r.errors };
        break;
      }

      case "create-dns-record": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records`, {
          method: "POST", body: JSON.stringify(data),
        });
        result = { success: r.success, record: r.result, errors: r.errors };
        break;
      }

      case "update-dns-record": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records/${data.id}`, {
          method: "PATCH", body: JSON.stringify(data),
        });
        result = { success: r.success, record: r.result, errors: r.errors };
        break;
      }

      case "delete-dns-record": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/dns_records/${data.id}`, {
          method: "DELETE",
        });
        result = { success: r.success, errors: r.errors };
        break;
      }

      // ─── Page Rules Actions ─────────────────────────────────────────
      case "get-page-rules": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/pagerules?status=active`);
        result = { success: r.success, rules: r.result, errors: r.errors };
        break;
      }

      case "create-page-rule": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/pagerules`, {
          method: "POST", body: JSON.stringify(data),
        });
        result = { success: r.success, rule: r.result, errors: r.errors };
        break;
      }

      case "update-page-rule": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/pagerules/${data.id}`, {
          method: "PUT", body: JSON.stringify(data.payload),
        });
        result = { success: r.success, rule: r.result, errors: r.errors };
        break;
      }

      case "delete-page-rules": {
        const deleteResults = await Promise.all(
          (data.ids as string[]).map((id: string) =>
            cfFetch(apiToken, `/zones/${zoneId}/pagerules/${id}`, { method: "DELETE" })
          )
        );
        result = { success: true, deleted: deleteResults };
        break;
      }

      // ─── Bulk Redirect List Actions (Account-level) ─────────────────
      case "list-bulk-redirect-lists": {
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rules/lists`);
        result = { success: r.success, lists: r.result, errors: r.errors };
        break;
      }

      case "create-bulk-redirect-list": {
        const { name, description } = data as { name: string; description?: string };
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rules/lists`, {
          method: "POST",
          body: JSON.stringify({ name, description: description || "", kind: "redirect" }),
        });
        result = { success: r.success, list: r.result, errors: r.errors };
        break;
      }

      case "get-bulk-redirect-list-items": {
        const { listId } = data as { listId: string };
        // Paginate to get all items
        let allItems: unknown[] = [];
        let cursor: string | undefined;
        for (let i = 0; i < 20; i++) {
          const url = cursor
            ? `/accounts/${accountId}/rules/lists/${listId}/items?per_page=500&cursor=${cursor}`
            : `/accounts/${accountId}/rules/lists/${listId}/items?per_page=500`;
          const r = await cfFetch(apiToken, url);
          if (!r.success) { result = { success: false, errors: r.errors }; break; }
          allItems = allItems.concat(r.result ?? []);
          cursor = r.result_info?.cursors?.after;
          if (!cursor) break;
        }
        if (!result) result = { success: true, items: allItems };
        break;
      }

      case "replace-bulk-redirect-list-items": {
        // Replace all items in a list (PUT)
        const { listId, items } = data as { listId: string; items: unknown[] };
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rules/lists/${listId}/items`, {
          method: "PUT",
          body: JSON.stringify(items),
        });
        result = { success: r.success, operation_id: r.result?.operation_id, errors: r.errors };
        break;
      }

      case "add-bulk-redirect-list-items": {
        const { listId, items } = data as { listId: string; items: unknown[] };
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rules/lists/${listId}/items`, {
          method: "POST",
          body: JSON.stringify(items),
        });
        result = { success: r.success, operation_id: r.result?.operation_id, errors: r.errors };
        break;
      }

      case "delete-bulk-redirect-list-items": {
        const { listId, items } = data as { listId: string; items: { id: string }[] };
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rules/lists/${listId}/items`, {
          method: "DELETE",
          body: JSON.stringify({ items }),
        });
        result = { success: r.success, operation_id: r.result?.operation_id, errors: r.errors };
        break;
      }

      case "check-bulk-operation": {
        const { operationId } = data as { operationId: string };
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rules/lists/bulk_operations/${operationId}`);
        result = { success: r.success, operation: r.result, errors: r.errors };
        break;
      }

      // ─── Bulk Redirect Rule (Account-level Ruleset) ─────────────────
      case "get-bulk-redirect-rules": {
        const r = await cfFetch(apiToken, `/accounts/${accountId}/rulesets/phases/http_request_redirect/entrypoint`);
        result = { success: r.success, ruleset: r.result, errors: r.errors };
        break;
      }

      case "ensure-bulk-redirect-rule": {
        // Ensure a rule exists that references the given list
        const { listName, listId: refListId } = data as { listName: string; listId: string };

        // Try to get the existing entrypoint ruleset
        const existing = await cfFetch(apiToken, `/accounts/${accountId}/rulesets/phases/http_request_redirect/entrypoint`);

        if (existing.success && existing.result) {
          // Check if rule already references this list
          const rules = existing.result.rules ?? [];
          const hasRule = rules.some((r: { action_parameters?: { from_list?: { name?: string } } }) =>
            r.action_parameters?.from_list?.name === listName
          );
          if (hasRule) {
            result = { success: true, message: "Rule already exists" };
          } else {
            // Add rule
            const newRule = {
              expression: `http.request.full_uri in $${listName}`,
              description: `Bulk Redirect rule for ${listName}`,
              action: "redirect",
              action_parameters: { from_list: { name: listName, key: "http.request.full_uri" } },
            };
            const r = await cfFetch(apiToken, `/accounts/${accountId}/rulesets/phases/http_request_redirect/entrypoint`, {
              method: "PUT",
              body: JSON.stringify({ rules: [...rules, newRule] }),
            });
            result = { success: r.success, errors: r.errors };
          }
        } else {
          // Create new ruleset
          const r = await cfFetch(apiToken, `/accounts/${accountId}/rulesets`, {
            method: "POST",
            body: JSON.stringify({
              name: "Bulk Redirect Rules",
              kind: "root",
              phase: "http_request_redirect",
              rules: [{
                expression: `http.request.full_uri in $${listName}`,
                description: `Bulk Redirect rule for ${listName}`,
                action: "redirect",
                action_parameters: { from_list: { name: listName, key: "http.request.full_uri" } },
              }],
            }),
          });
          result = { success: r.success, errors: r.errors };
        }
        break;
      }

      // ─── Legacy Ruleset Actions ─────────────────────────────────────
      case "create-redirect-ruleset": {
        const { targetUrl, redirectType, domainName } = data as { targetUrl: string; redirectType: "301" | "302"; domainName: string };
        const statusCode = parseInt(redirectType, 10);
        const rulesetsRes = await cfFetch(apiToken, `/zones/${zoneId}/rulesets`);
        const existingRedirectRuleset = (rulesetsRes.result ?? []).find((rs: { phase: string }) => rs.phase === "http_request_dynamic_redirect");
        const rulePayload = {
          description: `Bulk redirect for ${domainName}`,
          expression: `(http.host eq "${domainName}" or http.host eq "www.${domainName}")`,
          action: "redirect",
          action_parameters: { from_value: { status_code: statusCode, target_url: { value: targetUrl }, preserve_query_string: true } },
        };
        let createResult;
        if (existingRedirectRuleset) {
          const currentRuleset = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/${existingRedirectRuleset.id}`);
          const existingRules = currentRuleset.result?.rules ?? [];
          const filteredRules = existingRules.filter((r: { description?: string }) => !r.description?.includes(`for ${domainName}`));
          createResult = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/${existingRedirectRuleset.id}`, {
            method: "PUT", body: JSON.stringify({ rules: [...filteredRules, rulePayload] }),
          });
        } else {
          createResult = await cfFetch(apiToken, `/zones/${zoneId}/rulesets`, {
            method: "POST",
            body: JSON.stringify({ name: "Bulk Redirect Rules", kind: "zone", phase: "http_request_dynamic_redirect", rules: [rulePayload] }),
          });
        }
        result = { success: createResult.success, errors: createResult.errors };
        break;
      }

      case "get-redirect-ruleset": {
        const r = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`);
        result = { success: r.success, ruleset: r.result, errors: r.errors };
        break;
      }

      case "deploy-redirect-ruleset": {
        let r = await cfFetch(apiToken, `/zones/${zoneId}/rulesets/phases/http_request_dynamic_redirect/entrypoint`, {
          method: "PUT", body: JSON.stringify({ rules: data.rules }),
        });
        if (!r.success) {
          const notFound = (r.errors ?? []).some((e: { code?: number; message?: string }) =>
            e.code === 10009 || (e.message ?? "").toLowerCase().includes("not found")
          );
          if (notFound) {
            r = await cfFetch(apiToken, `/zones/${zoneId}/rulesets`, {
              method: "POST",
              body: JSON.stringify({ name: "Subdomain Redirect Rules", kind: "zone", phase: "http_request_dynamic_redirect", rules: data.rules }),
            });
          }
        }
        result = { success: r.success, ruleset: r.result, errors: r.errors };
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

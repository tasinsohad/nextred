import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CloudflareAccount {
  id: string;
  name: string;
}

type CloudflareAuthType = "token" | "global";

function normalizeApiCredential(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^Bearer\s+/i, "").trim() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, apiKey, authType } = await req.json() as {
      email?: string;
      apiKey?: string;
      authType?: CloudflareAuthType;
    };

    const normalizedEmail = typeof email === "string" ? email.trim() : "";
    const normalizedApiKey = normalizeApiCredential(apiKey);

    if (!normalizedApiKey) {
      return new Response(
        JSON.stringify({ error: "API key is required", details: "Please provide either a Global API Key or an API Token." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isGlobalKey = authType === "global"
      || (authType !== "token" && normalizedEmail && normalizedEmail !== "api-token@cloudflare" && normalizedEmail.includes("@"));

    let response: Response;
    let authMethod: string;

    if (isGlobalKey) {
      authMethod = "Global API Key";
      console.log(`Validating with Global API Key for email: ${normalizedEmail}`);
      response = await fetch("https://api.cloudflare.com/client/v4/accounts", {
        method: "GET",
        headers: {
          "X-Auth-Email": normalizedEmail,
          "X-Auth-Key": normalizedApiKey,
          "Content-Type": "application/json",
        },
      });
    } else {
      authMethod = "API Token";
      console.log("Validating with API Token (Bearer auth)");
      // First verify the token itself
      const verifyRes = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${normalizedApiKey}`,
          "Content-Type": "application/json",
        },
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        const errMsg = verifyData.errors?.[0]?.message || "Token verification failed";
        const docUrl = verifyData.errors?.[0]?.documentation_url ? ` See ${verifyData.errors[0].documentation_url}` : "";
        console.error("Token verify failed:", errMsg);
        return new Response(
          JSON.stringify({
            valid: false,
            error: "Invalid API Token",
            details: `Cloudflare rejected the token: ${errMsg}.${docUrl} If you copied the Authorization header value, remove the leading "Bearer " and paste only the token. Make sure you're using a valid API Token with Zone:Read, Zone:DNS:Edit, and Zone:Page Rules:Edit permissions.`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const tokenStatus = verifyData.result?.status;
      if (tokenStatus && tokenStatus !== "active") {
        return new Response(
          JSON.stringify({
            valid: false,
            error: "Inactive API Token",
            details: `Cloudflare reports this token is ${tokenStatus}. Enable it or create a new active token.`,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Token is valid, try to fetch accounts (may fail if token lacks Account:Read)
      let accounts: CloudflareAccount[] = [];
      try {
        response = await fetch("https://api.cloudflare.com/client/v4/accounts", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${normalizedApiKey}`,
            "Content-Type": "application/json",
          },
        });
        const accountsData = await response.json();
        if (accountsData.success) {
          accounts = (accountsData.result || []).map((account: any) => ({
            id: account.id,
            name: account.name,
          }));
        } else {
          console.log("Token valid but cannot list accounts (missing Account:Read permission). Continuing...");
        }
      } catch (e) {
        console.log("Could not fetch accounts, but token is verified:", e);
      }

      const primaryAccount = accounts[0];
      console.log(`Successfully validated (API Token). Found ${accounts.length} account(s)`);

      return new Response(
        JSON.stringify({
          valid: true,
          accountId: primaryAccount?.id || null,
          accountName: primaryAccount?.name || null,
          accounts,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Global API Key path
    const data = await response!.json();

    if (!data.success) {
      const errMsg = data.errors?.[0]?.message || "Authentication failed";
      const code = data.errors?.[0]?.code;
      console.error(`Cloudflare API validation failed (${authMethod}):`, data.errors);

      let hint = "";
      if (code === 6003 || code === 6111) {
        hint = " Double-check that the email and Global API Key match your Cloudflare account.";
      }

      return new Response(
        JSON.stringify({
          valid: false,
          error: `Invalid Cloudflare credentials (${authMethod})`,
          details: `${errMsg}.${hint}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accounts: CloudflareAccount[] = (data.result || []).map((account: any) => ({
      id: account.id,
      name: account.name,
    }));

    console.log(`Successfully validated (${authMethod}). Found ${accounts.length} account(s)`);

    const primaryAccount = accounts[0];

    return new Response(
      JSON.stringify({
        valid: true,
        accountId: primaryAccount?.id || null,
        accountName: primaryAccount?.name || null,
        accounts,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error validating Cloudflare credentials:", error);
    return new Response(
      JSON.stringify({ error: "Failed to validate credentials", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

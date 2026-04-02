import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CloudflareAccount {
  id: string;
  name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, apiKey } = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key is required", details: "Please provide either a Global API Key or an API Token." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Detect auth type: if email is provided, use Global API Key auth; otherwise use Bearer token
    const isGlobalKey = email && email !== "api-token@cloudflare" && email.includes("@");

    let response: Response;
    let authMethod: string;

    if (isGlobalKey) {
      authMethod = "Global API Key";
      console.log(`Validating with Global API Key for email: ${email}`);
      response = await fetch("https://api.cloudflare.com/client/v4/accounts", {
        method: "GET",
        headers: {
          "X-Auth-Email": email,
          "X-Auth-Key": apiKey,
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
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        const errMsg = verifyData.errors?.[0]?.message || "Token verification failed";
        console.error("Token verify failed:", errMsg);
        return new Response(
          JSON.stringify({
            error: "Invalid API Token",
            details: `Cloudflare rejected the token: ${errMsg}. Make sure you're using a valid API Token with Zone:Read, Zone:DNS:Edit, and Zone:Page Rules:Edit permissions.`,
          }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Token is valid, try to fetch accounts (may fail if token lacks Account:Read)
      let accounts: CloudflareAccount[] = [];
      try {
        response = await fetch("https://api.cloudflare.com/client/v4/accounts", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
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
          error: `Invalid Cloudflare credentials (${authMethod})`,
          details: `${errMsg}.${hint}`,
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

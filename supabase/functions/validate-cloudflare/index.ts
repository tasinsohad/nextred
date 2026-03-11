import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CloudflareValidateRequest {
  email: string;
  apiKey: string;
}

interface CloudflareAccount {
  id: string;
  name: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, apiKey }: CloudflareValidateRequest = await req.json();

    if (!email || !apiKey) {
      console.error("Missing email or apiKey in request");
      return new Response(
        JSON.stringify({ error: "Email and API key are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Validating Cloudflare credentials for email: ${email}`);

    // Validate credentials by fetching accounts from Cloudflare API
    const response = await fetch("https://api.cloudflare.com/client/v4/accounts", {
      method: "GET",
      headers: {
        "X-Auth-Email": email,
        "X-Auth-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!data.success) {
      console.error("Cloudflare API validation failed:", data.errors);
      return new Response(
        JSON.stringify({ 
          error: "Invalid Cloudflare credentials", 
          details: data.errors?.[0]?.message || "Authentication failed" 
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract account information
    const accounts: CloudflareAccount[] = data.result.map((account: any) => ({
      id: account.id,
      name: account.name,
    }));

    console.log(`Successfully validated. Found ${accounts.length} account(s)`);

    // Return the first account (most users have one)
    const primaryAccount = accounts[0];

    return new Response(
      JSON.stringify({ 
        valid: true, 
        accountId: primaryAccount?.id || null,
        accountName: primaryAccount?.name || null,
        accounts 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error validating Cloudflare credentials:", error);
    return new Response(
      JSON.stringify({ error: "Failed to validate credentials" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

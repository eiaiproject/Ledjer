export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`[requireEnv] Missing env var: ${name}`);
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function mayarBaseUrl() {
  const explicit = Deno.env.get("MAYAR_API_BASE_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  return Deno.env.get("MAYAR_ENV") === "sandbox"
    ? "https://api.mayar.club"
    : "https://api.mayar.id";
}

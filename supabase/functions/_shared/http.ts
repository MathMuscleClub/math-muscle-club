export function corsHeaders() {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export function handleOptions(request: Request) {
  if (request.method !== "OPTIONS") return null;
  return new Response("ok", { headers: corsHeaders() });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ message }, status);
}

export async function readAuthenticatedUser(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("ログイン情報がありません。");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const adminKey = getSupabaseAdminKey();
  if (!supabaseUrl || !adminKey) {
    throw new Error("Supabaseのサーバー設定が不足しています。");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: adminKey,
    },
  });

  if (!response.ok) throw new Error("ログイン情報を確認できませんでした。");
  return response.json();
}

function getSupabaseAdminKey() {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    try {
      const secretKeys = JSON.parse(secretKeysJson);
      if (secretKeys?.default) return String(secretKeys.default);
    } catch (_error) {
      // Fall back to the legacy key below.
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

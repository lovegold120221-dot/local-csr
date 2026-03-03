import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseClientFromRequest } from "@/lib/supabase-server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export type ApiPrincipal = {
  userId: string;
  authType: "session" | "api_key";
  apiKeyId: string | null;
  apiKeyPrefix: string | null;
};

type AuthResult =
  | { ok: true; principal: ApiPrincipal }
  | { ok: false; response: NextResponse };

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function getApiKeyToken(request: Request): string | null {
  const fromHeader = request.headers.get("x-api-key")?.trim();
  if (fromHeader) return fromHeader;
  return getBearerToken(request);
}

export function hashApiKey(rawApiKey: string): string {
  return crypto.createHash("sha256").update(rawApiKey).digest("hex");
}

export function getApiKeyPrefix(rawApiKey: string): string {
  // Keep a short stable prefix for UI display/auditing.
  return rawApiKey.slice(0, 18);
}

/**
 * Generates a key that includes a base64-encoded user segment + strong random bytes.
 * Note: the random segment carries the actual secrecy; the user segment is only an identifier hint.
 */
export function generateApiKeyForUser(userId: string): string {
  const encodedUser = Buffer.from(userId).toString("base64url").slice(0, 16);
  const randomPart = crypto.randomBytes(24).toString("base64url");
  return `vph_${encodedUser}_${randomPart}`;
}

export async function requireApiPrincipal(
  request: Request,
  options: { allowSessionToken?: boolean } = {}
): Promise<AuthResult> {
  const allowSessionToken = options.allowSessionToken ?? true;
  const bearerToken = getBearerToken(request);

  // 1) Prefer normal Supabase JWT auth for dashboard/browser calls.
  if (allowSessionToken && bearerToken) {
    const supabase = createSupabaseClientFromRequest(request);
    if (supabase) {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user?.id) {
        return {
          ok: true,
          principal: {
            userId: data.user.id,
            authType: "session",
            apiKeyId: null,
            apiKeyPrefix: null,
          },
        };
      }
    }
  }

  // 2) Fallback to API key auth (x-api-key OR Bearer key).
  const apiKey = getApiKeyToken(request);
  if (!apiKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized. Provide Bearer token or x-api-key." },
        { status: 401 }
      ),
    };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Server not configured for API key auth. Missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 }
      ),
    };
  }

  const keyHash = hashApiKey(apiKey);
  const { data, error } = await admin
    .from("api_keys")
    .select("id, user_id, key_prefix, revoked_at")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Failed to validate API key." }, { status: 500 }),
    };
  }

  if (!data || data.revoked_at) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid or revoked API key." }, { status: 401 }),
    };
  }

  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .is("revoked_at", null);

  return {
    ok: true,
    principal: {
      userId: data.user_id,
      authType: "api_key",
      apiKeyId: data.id,
      apiKeyPrefix: data.key_prefix,
    },
  };
}

export async function logApiUsage(params: {
  request: Request;
  principal: ApiPrincipal;
  endpoint: string;
  statusCode: number;
  startedAtMs: number;
  errorMessage?: string | null;
}) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const latency = Math.max(0, Date.now() - params.startedAtMs);
  await admin.from("api_usage").insert({
    user_id: params.principal.userId,
    api_key_id: params.principal.apiKeyId,
    endpoint: params.endpoint,
    method: params.request.method,
    status_code: params.statusCode,
    latency_ms: latency,
    error_message: params.errorMessage ?? null,
  });
}


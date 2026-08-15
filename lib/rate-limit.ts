import type { SupabaseClient } from "@supabase/supabase-js";

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  retry_after: number;
};

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfter: number; unavailable?: boolean };

export async function consumeRateLimit(
  supabase: SupabaseClient,
  scope: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_api_rate_limit", {
    p_scope: scope,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, retryAfter: 30, unavailable: true }
      : { allowed: true, remaining: limit };
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
  if (!row) {
    return process.env.NODE_ENV === "production"
      ? { allowed: false, retryAfter: 30, unavailable: true }
      : { allowed: true, remaining: limit };
  }

  return row.allowed
    ? { allowed: true, remaining: Math.max(0, Number(row.remaining) || 0) }
    : { allowed: false, retryAfter: Math.max(1, Number(row.retry_after) || 1) };
}

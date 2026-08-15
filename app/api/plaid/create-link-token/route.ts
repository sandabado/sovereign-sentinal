import { NextResponse } from "next/server";
import {
  hasPlaidConfig,
  plaidClient,
  PLAID_COUNTRY_CODES,
  PLAID_OPTIONAL_PRODUCTS,
  PLAID_PRODUCTS,
  publicAppUrl,
} from "@/lib/plaid";
import { sanitizePlaidError } from "@/lib/plaid-error";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
    if (!hasPlaidConfig()) {
      return NextResponse.json({ error: "Plaid credentials are not configured", code: "PLAID_NOT_CONFIGURED" }, { status: 503 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in before connecting a bank", code: "AUTH_REQUIRED" }, { status: 401 });
    }
    const rateLimit = await consumeRateLimit(supabase, "plaid_link_token", 20, 3600);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.unavailable ? "Security controls are temporarily unavailable" : "Too many bank connection attempts" },
        { status: rateLimit.unavailable ? 503 : 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "Sovereign",
      products: PLAID_PRODUCTS,
      optional_products: PLAID_OPTIONAL_PRODUCTS,
      country_codes: PLAID_COUNTRY_CODES,
      language: "en",
      webhook: `${publicAppUrl(request)}/api/plaid/webhook`,
      transactions: { days_requested: 90 },
    });
    return NextResponse.json({ link_token: response.data.link_token, expiration: response.data.expiration });
  } catch (error) {
    console.error("[Plaid] Link token creation failed", sanitizePlaidError(error));
    return NextResponse.json({ error: "Unable to prepare the secure bank connection" }, { status: 500 });
  }
}

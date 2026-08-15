import { NextResponse } from "next/server";
import { sanitizePlaidError } from "@/lib/plaid-error";
import { isItemLoginRequired, refreshPlaidBalances, syncPlaidItem, type StoredPlaidItem } from "@/lib/plaid-sync";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isTrustedMutationRequest } from "@/lib/request-security";
import { createAdminClient, createClient } from "@/lib/supabase/server";

function safeSyncMessage(error: unknown) {
  if (isItemLoginRequired(error)) return "Bank connection requires authentication";
  const details = sanitizePlaidError(error);
  return details.plaidErrorCode ? `Plaid sync error: ${details.plaidErrorCode}` : "Bank synchronization failed";
}

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rateLimit = await consumeRateLimit(authClient, "plaid_manual_sync", 12, 900);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.unavailable ? "Security controls are temporarily unavailable" : "Sync limit reached; try again shortly" },
        { status: rateLimit.unavailable ? 503 : 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }
    const supabase = createAdminClient();
    const { data: items, error } = await supabase
      .from("plaid_items")
      .select("id,user_id,item_id,access_token_encrypted,transaction_cursor,institution_name")
      .eq("user_id", user.id)
      .eq("status", "active");
    if (error) throw error;
    if (!items?.length) return NextResponse.json({ success: true, message: "No connected institutions", results: [] });

    const results = [];
    for (const item of items as StoredPlaidItem[]) {
      try {
        const [transactions, balances] = await Promise.all([
          syncPlaidItem(supabase, item),
          refreshPlaidBalances(supabase, item),
        ]);
        results.push({ institution: item.institution_name, status: "success", new_transactions: transactions.addedCount, accounts_updated: balances.accountCount });
      } catch (itemError) {
        const needsReauth = isItemLoginRequired(itemError);
        await supabase.from("plaid_items").update({
          status: needsReauth ? "needs_reauth" : "active",
          error_message: safeSyncMessage(itemError),
        }).eq("id", item.id).eq("user_id", user.id);
        results.push({ institution: item.institution_name, status: needsReauth ? "needs_reauth" : "error", error: safeSyncMessage(itemError) });
      }
    }
    return NextResponse.json({ success: true, results, synced_at: new Date().toISOString() });
  } catch (error) {
    console.error("[Plaid] Manual sync failed", sanitizePlaidError(error));
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

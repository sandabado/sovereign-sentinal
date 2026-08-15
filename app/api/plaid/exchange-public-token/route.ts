import { NextResponse } from "next/server";
import { z } from "zod";
import { plaidClient } from "@/lib/plaid";
import { sanitizePlaidError } from "@/lib/plaid-error";
import { consumeRateLimit } from "@/lib/rate-limit";
import { isTrustedMutationRequest, readBoundedJson, RequestSecurityError } from "@/lib/request-security";
import { syncPlaidItem, type StoredPlaidItem } from "@/lib/plaid-sync";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { encryptAccessToken } from "@/lib/token-crypto";

const bodySchema = z.object({
  public_token: z.string().min(1),
  institution_name: z.string().trim().max(160).optional().nullable(),
  institution_id: z.string().trim().max(100).optional().nullable(),
});

function accountType(type: string, subtype?: string | null) {
  if (type === "depository") return subtype === "savings" ? "savings" : "checking";
  if (type === "credit") return "credit";
  if (type === "loan") return subtype === "mortgage" ? "mortgage" : "loan";
  if (type === "investment") return subtype === "ira" ? "ira" : "investment";
  return "other";
}

export async function POST(request: Request) {
  try {
    if (!isTrustedMutationRequest(request)) {
      return NextResponse.json({ error: "Cross-origin request rejected" }, { status: 403 });
    }
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rateLimit = await consumeRateLimit(authClient, "plaid_token_exchange", 12, 3600);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.unavailable ? "Security controls are temporarily unavailable" : "Too many token exchange attempts" },
        { status: rateLimit.unavailable ? 503 : 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
      );
    }
    const parsed = bodySchema.safeParse(await readBoundedJson(request));
    if (!parsed.success) return NextResponse.json({ error: "Invalid token exchange request" }, { status: 400 });

    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: parsed.data.public_token });
    const encryptedToken = await encryptAccessToken(exchange.data.access_token);
    const supabase = createAdminClient();
    const now = new Date().toISOString();
    const { data: storedItem, error: itemError } = await supabase
      .from("plaid_items")
      .upsert({
        user_id: user.id,
        item_id: exchange.data.item_id,
        access_token_encrypted: encryptedToken,
        institution_id: parsed.data.institution_id ?? null,
        institution_name: parsed.data.institution_name ?? "Connected institution",
        status: "active",
        last_success_sync: now,
        error_message: null,
      }, { onConflict: "user_id,item_id" })
      .select("id,user_id,item_id,access_token_encrypted,transaction_cursor,institution_name")
      .single();
    if (itemError || !storedItem) throw itemError ?? new Error("Plaid item was not stored");

    const accountsResponse = await plaidClient.accountsGet({ access_token: exchange.data.access_token });
    const accountRows = accountsResponse.data.accounts.map((account) => ({
      user_id: user.id,
      plaid_item_id: storedItem.id,
      plaid_account_id: account.account_id,
      name: account.name || account.official_name || "Unnamed account",
      mask: account.mask ?? null,
      institution: parsed.data.institution_name ?? "Connected institution",
      type: accountType(account.type, account.subtype),
      balance: account.balances.current ?? account.balances.available ?? 0,
      previous_balance: account.balances.current ?? account.balances.available ?? 0,
      credit_limit: account.balances.limit ?? null,
      plaid_last_sync: now,
      updated_at: now,
    }));
    const { error: accountError } = await supabase
      .from("accounts")
      .upsert(accountRows, { onConflict: "user_id,plaid_account_id" });
    if (accountError) throw accountError;

    try {
      const liabilities = (await plaidClient.liabilitiesGet({ access_token: exchange.data.access_token })).data.liabilities;
      for (const card of liabilities.credit ?? []) {
        await supabase.from("accounts").update({
          apr: card.aprs.find((apr) => apr.apr_type === "purchase_apr")?.apr_percentage ?? card.aprs[0]?.apr_percentage ?? null,
          min_payment: card.minimum_payment_amount ?? null,
        }).eq("user_id", user.id).eq("plaid_account_id", card.account_id);
      }
      for (const mortgage of liabilities.mortgage ?? []) {
        await supabase.from("accounts").update({
          apr: mortgage.interest_rate?.percentage ?? null,
          min_payment: mortgage.next_monthly_payment ?? null,
        }).eq("user_id", user.id).eq("plaid_account_id", mortgage.account_id);
      }
      for (const loan of liabilities.student ?? []) {
        await supabase.from("accounts").update({
          apr: loan.interest_rate_percentage ?? null,
          min_payment: loan.minimum_payment_amount ?? null,
        }).eq("user_id", user.id).eq("plaid_account_id", loan.account_id);
      }
    } catch (error) {
      console.info("[Plaid] Liabilities are unavailable for this Item", sanitizePlaidError(error));
    }

    let transactionsSynced = 0;
    try {
      const result = await syncPlaidItem(supabase, storedItem as StoredPlaidItem);
      transactionsSynced = result.addedCount;
    } catch (error) {
      console.info("[Plaid] Initial transaction data is not ready; webhook will retry", sanitizePlaidError(error));
    }

    return NextResponse.json({
      success: true,
      institution: parsed.data.institution_name,
      accounts_synced: accountRows.length,
      transactions_synced: transactionsSynced,
    });
  } catch (error) {
    if (error instanceof RequestSecurityError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Plaid] Public token exchange failed", sanitizePlaidError(error));
    return NextResponse.json({ error: "The bank connected, but Sovereign could not save it safely" }, { status: 500 });
  }
}

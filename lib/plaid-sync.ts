import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction } from "plaid";
import { plaidClient } from "@/lib/plaid";
import { decryptAccessToken } from "@/lib/token-crypto";
import { scanSubscriptionsForUser } from "@/lib/subscription-sync";

export interface StoredPlaidItem {
  id: string;
  user_id: string;
  item_id: string;
  access_token_encrypted: string;
  transaction_cursor: string | null;
  institution_name: string | null;
}

function transactionRow(
  transaction: Transaction,
  userId: string,
  accountMap: Map<string, string>,
) {
  return {
    user_id: userId,
    account_id: accountMap.get(transaction.account_id) ?? null,
    plaid_transaction_id: transaction.transaction_id,
    date: transaction.date,
    description: transaction.merchant_name || transaction.name || "Unknown",
    amount: transaction.amount * -1,
    category:
      transaction.personal_finance_category?.primary ??
      transaction.category?.[0] ??
      "UNCATEGORIZED",
    subcategory:
      transaction.personal_finance_category?.detailed ??
      transaction.category?.[1] ??
      null,
    pending: transaction.pending,
    source: "plaid",
    updated_at: new Date().toISOString(),
  };
}

function calendarRow(row: ReturnType<typeof transactionRow>) {
  return {
    user_id: row.user_id,
    canonical_key: `plaid:${row.plaid_transaction_id}`,
    plaid_transaction_id: row.plaid_transaction_id,
    account_id: row.account_id,
    date: row.date,
    title: row.description,
    amount: row.amount,
    event_type: row.amount > 0 ? "income" : "bill",
    status: row.pending ? "pending" : "posted",
    recurrence: "one_time",
    source: "plaid",
    updated_at: row.updated_at,
  };
}

function plaidErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const response = "response" in error ? error.response : null;
  if (!response || typeof response !== "object" || !("data" in response)) return null;
  const data = response.data;
  if (!data || typeof data !== "object" || !("error_code" in data)) return null;
  return typeof data.error_code === "string" ? data.error_code : null;
}

export async function syncPlaidItem(
  supabase: SupabaseClient,
  item: StoredPlaidItem,
) {
  const accessToken = await decryptAccessToken(item.access_token_encrypted);
  const { data: storedAccounts } = await supabase
    .from("accounts")
    .select("id,plaid_account_id")
    .eq("user_id", item.user_id)
    .eq("plaid_item_id", item.id);
  const accountMap = new Map<string, string>(
    (storedAccounts ?? []).flatMap((account) =>
      account.plaid_account_id ? [[account.plaid_account_id, account.id]] : [],
    ),
  );

  let attempts = 0;
  while (attempts < 3) {
    attempts += 1;
    const originalCursor = item.transaction_cursor ?? undefined;
    let cursor = originalCursor;
    let hasMore = true;
    let addedCount = 0;

    try {
      while (hasMore) {
        const response = await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor,
          count: 500,
        });
        const added = response.data.added.map((transaction) =>
          transactionRow(transaction, item.user_id, accountMap),
        );
        const modified = response.data.modified.map((transaction) =>
          transactionRow(transaction, item.user_id, accountMap),
        );

        if (added.length) {
          const { error } = await supabase
            .from("transactions")
            .upsert(added, { onConflict: "plaid_transaction_id" });
          if (error) throw error;
          const { error: calendarError } = await supabase
            .from("calendar_events")
            .upsert(added.map(calendarRow), { onConflict: "user_id,canonical_key" });
          if (calendarError) throw calendarError;
          addedCount += added.length;
        }
        if (modified.length) {
          const { error } = await supabase
            .from("transactions")
            .upsert(modified, { onConflict: "plaid_transaction_id" });
          if (error) throw error;
          const { error: calendarError } = await supabase
            .from("calendar_events")
            .upsert(modified.map(calendarRow), { onConflict: "user_id,canonical_key" });
          if (calendarError) throw calendarError;
        }
        if (response.data.removed.length) {
          const removedIds = response.data.removed.map((transaction) => transaction.transaction_id);
          const { error } = await supabase
            .from("transactions")
            .delete()
            .eq("user_id", item.user_id)
            .in("plaid_transaction_id", removedIds);
          if (error) throw error;
          const { error: calendarError } = await supabase
            .from("calendar_events")
            .delete()
            .eq("user_id", item.user_id)
            .in("plaid_transaction_id", removedIds);
          if (calendarError) throw calendarError;
        }

        hasMore = response.data.has_more;
        cursor = response.data.next_cursor;
      }

      const syncedAt = new Date().toISOString();
      const { error } = await supabase
        .from("plaid_items")
        .update({ transaction_cursor: cursor, last_success_sync: syncedAt, error_message: null })
        .eq("id", item.id)
        .eq("user_id", item.user_id);
      if (error) throw error;
      const sentinel = await scanSubscriptionsForUser(supabase, item.user_id);
      return { addedCount, cursor, syncedAt, subscriptionsDetected: sentinel.detected };
    } catch (error) {
      if (
        plaidErrorCode(error) === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION" &&
        attempts < 3
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Transaction sync could not obtain a stable page set");
}

export async function refreshPlaidBalances(
  supabase: SupabaseClient,
  item: StoredPlaidItem,
) {
  const accessToken = await decryptAccessToken(item.access_token_encrypted);
  const response = await plaidClient.accountsBalanceGet({ access_token: accessToken });
  const syncedAt = new Date().toISOString();

  for (const account of response.data.accounts) {
    const { data: current } = await supabase
      .from("accounts")
      .select("balance")
      .eq("user_id", item.user_id)
      .eq("plaid_account_id", account.account_id)
      .maybeSingle();
    const { error } = await supabase
      .from("accounts")
      .update({
        previous_balance: current?.balance ?? account.balances.current,
        balance: account.balances.current ?? account.balances.available ?? 0,
        plaid_last_sync: syncedAt,
        updated_at: syncedAt,
      })
      .eq("user_id", item.user_id)
      .eq("plaid_account_id", account.account_id);
    if (error) throw error;
  }
  return { accountCount: response.data.accounts.length, syncedAt };
}

export function isItemLoginRequired(error: unknown) {
  return plaidErrorCode(error) === "ITEM_LOGIN_REQUIRED";
}

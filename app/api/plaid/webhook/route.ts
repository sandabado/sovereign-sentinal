import { NextResponse } from "next/server";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";
import { plaidClient } from "@/lib/plaid";
import { sanitizePlaidError } from "@/lib/plaid-error";
import {
  claimWebhookReceipt,
  completeWebhookReceipt,
  failWebhookReceipt,
  webhookReceiptHash,
} from "@/lib/plaid-webhook-receipts";
import { isItemLoginRequired, syncPlaidItem, type StoredPlaidItem } from "@/lib/plaid-sync";
import { verifyPlaidWebhook } from "@/lib/plaid-webhook";
import { createAdminClient } from "@/lib/supabase/server";
import { decryptAccessToken } from "@/lib/token-crypto";

const MAX_WEBHOOK_BYTES = 256 * 1024;

const webhookSchema = z.object({
  webhook_type: z.string().min(1).max(80),
  webhook_code: z.string().min(1).max(100),
  item_id: z.string().min(1).max(200).optional(),
  error: z.object({ error_message: z.string().max(1000).optional() }).passthrough().optional(),
}).passthrough();

function safeErrorCode(error: unknown) {
  const sanitized = sanitizePlaidError(error);
  return sanitized.plaidErrorCode ?? sanitized.name ?? "PROCESSING_FAILED";
}

async function checkedItemUpdate(
  supabase: ReturnType<typeof createAdminClient>,
  itemId: string,
  values: Record<string, string | null>,
) {
  const { error } = await supabase.from("plaid_items").update(values).eq("id", itemId);
  if (error) throw new Error("Plaid item state could not be updated");
}

async function syncHoldings(
  supabase: ReturnType<typeof createAdminClient>,
  item: StoredPlaidItem,
) {
  const accessToken = await decryptAccessToken(item.access_token_encrypted);
  const response = await plaidClient.investmentsHoldingsGet({ access_token: accessToken });
  const securities = new Map(response.data.securities.map((security) => [security.security_id, security]));
  const rows = response.data.holdings.map((holding) => {
    const security = securities.get(holding.security_id);
    return {
      user_id: item.user_id,
      plaid_account_id: holding.account_id,
      security_id: holding.security_id,
      ticker: security?.ticker_symbol ?? null,
      name: security?.name ?? "Unknown security",
      type: security?.type ?? "unknown",
      quantity: holding.quantity,
      price: holding.institution_price ?? security?.close_price ?? 0,
      value: holding.institution_value,
      cost_basis: holding.cost_basis ?? null,
      updated_at: new Date().toISOString(),
    };
  });
  if (!rows.length) return;
  const { error } = await supabase
    .from("investment_holdings")
    .upsert(rows, { onConflict: "user_id,plaid_account_id,security_id" });
  if (error) throw new Error("Investment holdings could not be stored");
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Webhook body is too large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Webhook body is too large" }, { status: 413 });
  }

  const signature = request.headers.get("Plaid-Verification");
  if (!(await verifyPlaidWebhook(rawBody, signature))) {
    return NextResponse.json({ error: "Invalid Plaid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = webhookSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ received: true });
  const { webhook_type: type, webhook_code: code, item_id: itemId } = parsed.data;
  if (!itemId) return NextResponse.json({ received: true });

  let receiptHash: string | null = null;
  let storedItemId: string | null = null;
  try {
    const supabase = createAdminClient();
    receiptHash = await webhookReceiptHash(signature, rawBody);
    const claimed = await claimWebhookReceipt(supabase, {
      signatureHash: receiptHash,
      itemId,
      webhookType: type,
      webhookCode: code,
    });
    if (!claimed) return NextResponse.json({ received: true, duplicate: true });

    const { data: item, error: itemError } = await supabase
      .from("plaid_items")
      .select("id,user_id,item_id,access_token_encrypted,transaction_cursor,institution_name")
      .eq("item_id", itemId)
      .maybeSingle();
    if (itemError) throw new Error("Plaid item lookup failed");
    if (!item) {
      await completeWebhookReceipt(supabase, receiptHash);
      return NextResponse.json({ received: true });
    }
    storedItemId = item.id;

    if (type === "TRANSACTIONS" && code === "SYNC_UPDATES_AVAILABLE") {
      await syncPlaidItem(supabase, item as StoredPlaidItem);
    } else if (type === "ITEM" && code === "LOGIN_REPAIRED") {
      await checkedItemUpdate(supabase, item.id, { status: "active", error_message: null });
    } else if (type === "ITEM" && code === "ERROR") {
      await checkedItemUpdate(supabase, item.id, {
        status: "needs_reauth",
        error_message: parsed.data.error?.error_message ?? "Re-authentication required",
      });
      await createNotification(supabase, {
        userId: item.user_id,
        kind: "bank.reauthentication_required",
        title: "Bank connection needs attention",
        body: (item.institution_name ?? "A connected institution") + " needs to be reconnected before syncing can continue.",
        dedupeKey: "plaid-item:" + item.id + ":reauth",
      });
    } else if (type === "ITEM" && (code === "PENDING_EXPIRATION" || code === "PENDING_DISCONNECT")) {
      await checkedItemUpdate(supabase, item.id, {
        status: "needs_reauth",
        error_message: "Connection will expire soon",
      });
      await createNotification(supabase, {
        userId: item.user_id,
        kind: "bank.connection_expiring",
        title: "Bank connection expiring",
        body: (item.institution_name ?? "A connected institution") + " will need reconnection soon.",
        dedupeKey: "plaid-item:" + item.id + ":expiring",
      });
    } else if (type === "ITEM" && (code === "USER_PERMISSION_REVOKED" || code === "USER_ACCOUNT_REVOKED")) {
      await checkedItemUpdate(supabase, item.id, {
        status: "revoked",
        error_message: "Bank access was revoked",
      });
      await createNotification(supabase, {
        userId: item.user_id,
        kind: "bank.permission_revoked",
        title: "Bank access was revoked",
        body: (item.institution_name ?? "A connected institution") + " is no longer sharing data with Sovereign.",
        dedupeKey: "plaid-item:" + item.id + ":revoked",
      });
    } else if (type === "ITEM" && code === "WEBHOOK_UPDATE_ACKNOWLEDGED") {
      await checkedItemUpdate(supabase, item.id, { error_message: null });
    } else if (type === "HOLDINGS" && code === "DEFAULT_UPDATE") {
      await syncHoldings(supabase, item as StoredPlaidItem);
    }

    await completeWebhookReceipt(supabase, receiptHash);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Plaid] Verified webhook processing failed", sanitizePlaidError(error));
    try {
      const supabase = createAdminClient();
      if (receiptHash) await failWebhookReceipt(supabase, receiptHash, safeErrorCode(error));
      if (storedItemId && isItemLoginRequired(error)) {
        await checkedItemUpdate(supabase, storedItemId, {
          status: "needs_reauth",
          error_message: "Bank connection requires authentication",
        });
      }
    } catch {
      // Preserve the original processing failure so Plaid retries delivery.
    }
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

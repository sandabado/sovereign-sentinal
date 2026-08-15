import type { SupabaseClient } from "@supabase/supabase-js";

type ExistingReceipt = {
  status: "processing" | "processed" | "failed";
  attempt_count: number;
  updated_at: string;
};

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function webhookReceiptHash(signature: string | null, rawBody: string) {
  const identity = signature ? "jwt:" + signature : "local-body:" + rawBody;
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity)));
}

export async function claimWebhookReceipt(
  supabase: SupabaseClient,
  input: { signatureHash: string; itemId: string; webhookType: string; webhookCode: string },
) {
  const { error: insertError } = await supabase.from("plaid_webhook_receipts").insert({
    signature_hash: input.signatureHash,
    item_id: input.itemId,
    webhook_type: input.webhookType,
    webhook_code: input.webhookCode,
    status: "processing",
    attempt_count: 1,
  });
  if (!insertError) return true;
  if (insertError.code !== "23505") throw new Error("Webhook receipt could not be recorded");

  const { data, error } = await supabase
    .from("plaid_webhook_receipts")
    .select("status,attempt_count,updated_at")
    .eq("signature_hash", input.signatureHash)
    .maybeSingle();
  if (error) throw new Error("Webhook receipt could not be inspected");
  const existing = data as ExistingReceipt | null;
  if (!existing || existing.status === "processed") return false;

  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString();
  if (existing.status === "processing" && existing.updated_at >= staleBefore) return false;

  let reclaim = supabase
    .from("plaid_webhook_receipts")
    .update({
      status: "processing",
      attempt_count: existing.attempt_count + 1,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    })
    .eq("signature_hash", input.signatureHash)
    .eq("status", existing.status);
  if (existing.status === "processing") reclaim = reclaim.lt("updated_at", staleBefore);
  const { data: reclaimed, error: reclaimError } = await reclaim.select("signature_hash").maybeSingle();
  if (reclaimError) throw new Error("Webhook receipt could not be reclaimed");
  return Boolean(reclaimed);
}

export async function completeWebhookReceipt(supabase: SupabaseClient, signatureHash: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("plaid_webhook_receipts")
    .update({ status: "processed", processed_at: now, updated_at: now, last_error_code: null })
    .eq("signature_hash", signatureHash)
    .eq("status", "processing");
  if (error) throw new Error("Webhook receipt could not be completed");
}

export async function failWebhookReceipt(supabase: SupabaseClient, signatureHash: string, errorCode: string) {
  await supabase
    .from("plaid_webhook_receipts")
    .update({ status: "failed", last_error_code: errorCode, updated_at: new Date().toISOString() })
    .eq("signature_hash", signatureHash);
}

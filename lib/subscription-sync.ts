import type { SupabaseClient } from "@supabase/supabase-js";
import { detectSubscriptions } from "@/lib/subscription-engine";
import type { Transaction } from "@/lib/types";
import { addMonthsClamped, formatISODate, parseISODate } from "@/lib/calendar-engine";

export async function scanSubscriptionsForUser(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id,date,description,amount,category,is_recurring,pending")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(500);
  if (error) throw error;
  const transactions: Transaction[] = (rows ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    isRecurring: row.is_recurring,
    pending: row.pending,
  }));
  const detected = detectSubscriptions(transactions);
  if (!detected.length) return { detected: 0 };

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("detection_key,amount")
    .eq("user_id", userId);
  const existingAmounts = new Map<string, number>(
    (existing ?? []).flatMap((subscription) =>
      subscription.detection_key
        ? [[subscription.detection_key, Number(subscription.amount)]]
        : [],
    ),
  );
  const now = new Date().toISOString();
  const records = detected.map((subscription) => {
    const previous = existingAmounts.get(subscription.detectionKey!);
    return {
      user_id: userId,
      detection_key: subscription.detectionKey,
      name: subscription.name,
      amount: subscription.amount,
      previous_amount:
        previous != null && Math.abs(previous - subscription.amount) > 0.01
          ? previous
          : subscription.previousAmount ?? null,
      frequency: subscription.frequency,
      category: subscription.category,
      active: true,
      last_charged_date: subscription.lastChargedDate ?? null,
      overlap_group: subscription.overlapGroup ?? null,
      updated_at: now,
    };
  });
  const { data: storedSubscriptions, error: upsertError } = await supabase
    .from("subscriptions")
    .upsert(records, { onConflict: "user_id,detection_key" })
    .select("id,detection_key,name,amount,frequency,last_charged_date");
  if (upsertError) throw upsertError;

  const nextDate = (lastCharged: string, frequency: string) => {
    const date = parseISODate(lastCharged);
    if (frequency === "weekly") date.setDate(date.getDate() + 7);
    else return formatISODate(addMonthsClamped(date, frequency === "annual" ? 12 : 1));
    return formatISODate(date);
  };
  const calendarRows = (storedSubscriptions ?? []).flatMap((subscription) =>
    subscription.last_charged_date
      ? [{
          user_id: userId,
          canonical_key: `subscription:${subscription.id}`,
          date: nextDate(subscription.last_charged_date, subscription.frequency),
          title: subscription.name,
          description: "Recurring charge detected by Subscription Sentinel",
          amount: -Math.abs(Number(subscription.amount)),
          event_type: "subscription",
          status: "scheduled",
          recurrence: subscription.frequency === "annual" ? "annually" : subscription.frequency,
          recurrence_day: Number(subscription.last_charged_date.slice(-2)),
          subscription_id: subscription.id,
          source: "detected",
          updated_at: now,
        }]
      : [],
  );
  if (calendarRows.length) {
    const { error: calendarError } = await supabase
      .from("calendar_events")
      .upsert(calendarRows, { onConflict: "user_id,canonical_key" });
    if (calendarError) throw calendarError;
  }
  return { detected: records.length };
}

import type { SupabaseClient } from "@supabase/supabase-js";

export async function createNotification(
  supabase: SupabaseClient,
  input: { userId: string; kind: string; title: string; body: string; dedupeKey: string },
) {
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    dedupe_key: input.dedupeKey,
  });
  if (error && error.code !== "23505") throw new Error("Notification could not be recorded");
}

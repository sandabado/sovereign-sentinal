"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { detectSubscriptions, mergeSubscriptions } from "@/lib/subscription-engine";
import type {
  Subscription,
  SubscriptionDraft,
  SubscriptionTransfer,
  SubscriptionUpdate,
  Transaction,
} from "@/lib/types";

type SubscriptionRow = {
  id: string;
  owner_id: string | null;
  household_id: string | null;
  entity_id: string | null;
  account_id: string | null;
  detection_key: string | null;
  name: string;
  amount: number | string;
  previous_amount: number | string | null;
  frequency: Subscription["frequency"];
  category: string | null;
  active: boolean;
  next_billing_date: string | null;
  last_charged_date: string | null;
  overlap_group: string | null;
  cancellation_url: string | null;
  notes: string | null;
};

type MutationContext = {
  supabase: SupabaseClient;
  user: User;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalValue(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function subscriptionKey(subscription: Pick<Subscription, "name" | "detectionKey">) {
  return subscription.detectionKey ?? subscription.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function fromRow(row: SubscriptionRow): Subscription {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    householdId: row.household_id ?? undefined,
    entityId: row.entity_id ?? undefined,
    accountId: row.account_id ?? undefined,
    detectionKey: row.detection_key ?? undefined,
    name: row.name,
    amount: Number(row.amount),
    previousAmount: row.previous_amount == null ? undefined : Number(row.previous_amount),
    frequency: row.frequency,
    category: row.category ?? "Other",
    active: row.active,
    nextBillingDate: row.next_billing_date ?? undefined,
    lastChargedDate: row.last_charged_date ?? undefined,
    overlapGroup: row.overlap_group ?? undefined,
    cancellationUrl: row.cancellation_url ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function insertRow(input: SubscriptionDraft, user: User, active = true) {
  return {
    user_id: user.id,
    owner_id: input.ownerId ?? user.id,
    household_id: optionalValue(input.householdId),
    entity_id: optionalValue(input.entityId),
    account_id: optionalValue(input.accountId),
    name: input.name.trim(),
    amount: input.amount,
    frequency: input.frequency,
    category: input.category.trim() || "Other",
    active,
    next_billing_date: optionalValue(input.nextBillingDate),
    cancellation_url: optionalValue(input.cancellationUrl),
    notes: optionalValue(input.notes),
  };
}

function updateRow(input: SubscriptionUpdate) {
  const row: Record<string, string | number | null> = {};
  if (input.ownerId !== undefined) row.owner_id = optionalValue(input.ownerId);
  if (input.householdId !== undefined) row.household_id = optionalValue(input.householdId);
  if (input.entityId !== undefined) row.entity_id = optionalValue(input.entityId);
  if (input.accountId !== undefined) row.account_id = optionalValue(input.accountId);
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.amount !== undefined) row.amount = input.amount;
  if (input.frequency !== undefined) row.frequency = input.frequency;
  if (input.category !== undefined) row.category = input.category.trim() || "Other";
  if (input.nextBillingDate !== undefined) row.next_billing_date = optionalValue(input.nextBillingDate);
  if (input.cancellationUrl !== undefined) row.cancellation_url = optionalValue(input.cancellationUrl);
  if (input.notes !== undefined) row.notes = optionalValue(input.notes);
  return row;
}

function localId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `local_${crypto.randomUUID()}`
    : `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function useRealtimeSubscriptions(
  fallback: Subscription[],
  transactions: Transaction[],
) {
  const detected = useMemo(() => detectSubscriptions(transactions), [transactions]);
  const [stored, setStored] = useState<Subscription[]>(fallback);
  const [source, setSource] = useState<"seed" | "live">("seed");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      // Database RLS defines visibility. Household admins may be permitted to
      // see records beyond their own user id, so this query stays unfiltered.
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .order("amount", { ascending: false });
      if (!active || error) return;

      setStored(((data ?? []) as SubscriptionRow[]).map(fromRow));
      setSource("live");
      channel = supabase
        .channel(`subscriptions:${user.id}`)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "subscriptions",
        }, (payload) => {
          if (payload.eventType === "DELETE") {
            setStored((current) => current.filter((subscription) => subscription.id !== String(payload.old.id)));
            return;
          }
          const subscription = fromRow(payload.new as SubscriptionRow);
          setSource("live");
          setStored((current) => {
            const exists = current.some((item) => item.id === subscription.id);
            return exists
              ? current.map((item) => item.id === subscription.id ? subscription : item)
              : [subscription, ...current];
          });
        })
        .subscribe();
    })();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const visibleSubscriptions = useMemo(() => {
    const storedKeys = new Set(stored.map(subscriptionKey));
    const newDetections = detected.filter((subscription) => !storedKeys.has(subscriptionKey(subscription)));
    return mergeSubscriptions(stored, newDetections);
  }, [detected, stored]);

  const mutationContext = useCallback(async (): Promise<MutationContext | null> => {
    const supabase = createClient();
    if (!supabase) return null;
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user ? { supabase, user } : null;
  }, []);

  const findSubscription = useCallback((id: string) => (
    visibleSubscriptions.find((subscription) => subscription.id === id)
  ), [visibleSubscriptions]);

  const createSubscription = useCallback(async (input: SubscriptionDraft): Promise<Subscription> => {
    const context = await mutationContext();
    if (!context) {
      const created: Subscription = { id: localId(), ...input, active: true };
      setStored((current) => [created, ...current]);
      return created;
    }

    const { data, error } = await context.supabase
      .from("subscriptions")
      .insert(insertRow(input, context.user))
      .select("*")
      .single();
    if (error) throw error;
    const created = fromRow(data as SubscriptionRow);
    setStored((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    setSource("live");
    return created;
  }, [mutationContext]);

  const updateSubscription = useCallback(async (id: string, input: SubscriptionUpdate): Promise<Subscription> => {
    const current = findSubscription(id);
    if (!current) throw new Error("Subscription not found.");
    const context = await mutationContext();

    if (!context) {
      const updated = { ...current, ...input };
      setStored((items) => [updated, ...items.filter((item) => item.id !== id)]);
      return updated;
    }

    if (!UUID_PATTERN.test(id)) {
      const draft = { ...current, ...input };
      const { data, error } = await context.supabase
        .from("subscriptions")
        .insert(insertRow(draft, context.user))
        .select("*")
        .single();
      if (error) throw error;
      const created = fromRow(data as SubscriptionRow);
      setStored((items) => [created, ...items.filter((item) => item.id !== id)]);
      setSource("live");
      return created;
    }

    const { data, error } = await context.supabase
      .from("subscriptions")
      .update(updateRow(input))
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    const updated = fromRow(data as SubscriptionRow);
    setStored((items) => items.map((item) => item.id === id ? updated : item));
    return updated;
  }, [findSubscription, mutationContext]);

  const archiveSubscription = useCallback(async (id: string, notes?: string): Promise<void> => {
    const current = findSubscription(id);
    if (!current) throw new Error("Subscription not found.");
    const context = await mutationContext();
    const archived = { ...current, active: false, notes: notes?.trim() || current.notes };

    if (!context) {
      setStored((items) => [archived, ...items.filter((item) => item.id !== id)]);
      return;
    }

    if (!UUID_PATTERN.test(id)) {
      const draft = archived;
      const { data, error } = await context.supabase
        .from("subscriptions")
        .insert(insertRow(draft, context.user, false))
        .select("*")
        .single();
      if (error) throw error;
      const created = fromRow(data as SubscriptionRow);
      setStored((items) => [created, ...items.filter((item) => item.id !== id)]);
      setSource("live");
      return;
    }

    const values: Record<string, string | boolean | null> = { active: false };
    if (notes?.trim()) values.notes = notes.trim();
    const { error } = await context.supabase.from("subscriptions").update(values).eq("id", id);
    if (error) throw error;
    setStored((items) => items.map((item) => item.id === id ? archived : item));
  }, [findSubscription, mutationContext]);

  const transferSubscription = useCallback(async (id: string, transfer: SubscriptionTransfer): Promise<Subscription> => {
    const current = findSubscription(id);
    if (!current) throw new Error("Subscription not found.");
    return updateSubscription(id, {
      entityId: transfer.entityId,
      accountId: transfer.accountId,
      ownerId: transfer.ownerId,
      notes: transfer.notes ?? current.notes,
    });
  }, [findSubscription, updateSubscription]);

  return {
    subscriptions: visibleSubscriptions,
    source,
    createSubscription,
    updateSubscription,
    archiveSubscription,
    transferSubscription,
  };
}

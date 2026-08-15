"use client";

import { useCallback, useEffect, useState } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { CalendarEvent, EventStatus, EventType, NewCalendarEvent, RecurrencePattern } from "@/lib/calendar-types";

type CalendarRow = {
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  description: string | null;
  amount: number | string;
  event_type: EventType;
  status: EventStatus;
  recurrence: RecurrencePattern;
  recurrence_day: number | null;
  owner_id: string | null;
  household_id: string | null;
  shared: boolean | null;
  entity_id: string | null;
  account_id: string | null;
  debt_id: string | null;
  subscription_id: string | null;
  source: CalendarEvent["source"];
  created_at: string;
  updated_at: string;
};

function fromRow(row: CalendarRow): CalendarEvent {
  return {
    id: row.id,
    date: row.date,
    endDate: row.end_date ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    amount: Number(row.amount),
    eventType: row.event_type,
    status: row.status,
    recurrence: row.recurrence,
    recurrenceDay: row.recurrence_day ?? undefined,
    ownerId: row.owner_id ?? undefined,
    householdId: row.household_id ?? undefined,
    shared: row.shared ?? false,
    entityId: row.entity_id ?? undefined,
    accountId: row.account_id ?? undefined,
    debtId: row.debt_id ?? undefined,
    subscriptionId: row.subscription_id ?? undefined,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useRealtimeCalendar(fallback: CalendarEvent[]) {
  const { activeHouseholdId } = useAuth();
  const [events, setEvents] = useState(fallback);
  const [source, setSource] = useState<"seed" | "live">("seed");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    let channel: RealtimeChannel | null = null;
    void (async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser || !active) return;
      setUser(currentUser);
      const { data } = await supabase.from("calendar_events").select("*").order("date", { ascending: true });
      if (!active) return;
      setEvents(((data ?? []) as CalendarRow[]).map(fromRow));
      setSource("live");
      channel = supabase.channel(`calendar:${currentUser.id}`).on("postgres_changes", {
        event: "*", schema: "public", table: "calendar_events",
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setEvents((current) => current.filter((event) => event.id !== String(payload.old.id)));
          return;
        }
        const event = fromRow(payload.new as CalendarRow);
        setEvents((current) => {
          const exists = current.some((item) => item.id === event.id);
          return exists ? current.map((item) => item.id === event.id ? event : item) : [...current, event];
        });
      }).subscribe();
    })();
    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  const addEvent = useCallback(async (input: NewCalendarEvent) => {
    const now = new Date().toISOString();
    const local: CalendarEvent = { ...input, id: crypto.randomUUID(), source: "manual", createdAt: now, updatedAt: now };
    const supabase = createClient();
    if (!supabase || !user) {
      setEvents((current) => [...current, local]);
      return local;
    }
    const { data, error } = await supabase.from("calendar_events").insert({
      user_id: user.id,
      owner_id: input.ownerId ?? user.id,
      household_id: input.householdId ?? activeHouseholdId,
      shared: input.shared ?? false,
      entity_id: input.entityId ?? null,
      account_id: input.accountId ?? null,
      debt_id: input.debtId ?? null,
      subscription_id: input.subscriptionId ?? null,
      date: input.date,
      title: input.title,
      description: input.description ?? null,
      amount: input.amount,
      event_type: input.eventType,
      status: input.status,
      recurrence: input.recurrence,
      recurrence_day: input.recurrenceDay ?? null,
      source: "manual",
    }).select("*").single();
    if (error) throw error;
    const saved = fromRow(data as CalendarRow);
    setEvents((current) => current.some((event) => event.id === saved.id) ? current : [...current, saved]);
    return saved;
  }, [activeHouseholdId, user]);

  return { events, source, addEvent };
}

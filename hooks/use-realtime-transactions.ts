"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Transaction } from "@/lib/types";

type TransactionRow = {
  id: string;
  owner_id: string | null;
  household_id: string | null;
  date: string;
  description: string | null;
  amount: number | string;
  category: string | null;
  is_recurring: boolean;
  pending: boolean;
};

function transactionFromRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    householdId: row.household_id ?? undefined,
    date: row.date,
    description: row.description ?? "Unknown transaction",
    amount: Number(row.amount),
    category: row.category ?? "Uncategorized",
    isRecurring: row.is_recurring,
    pending: row.pending,
  };
}

export function useRealtimeTransactions(fallback: Transaction[], limit = 50) {
  const [transactions, setTransactions] = useState(fallback);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    let channel: RealtimeChannel | null = null;
    let badgeTimer: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase.from("transactions").select("*").order("date", { ascending: false }).limit(limit);
      if (!active) return;
      setTransactions(((data ?? []) as TransactionRow[]).map(transactionFromRow));
      channel = supabase.channel(`transactions:${user.id}`).on("postgres_changes", {
        event: "*", schema: "public", table: "transactions",
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setTransactions((current) => current.filter((transaction) => transaction.id !== String(payload.old.id)));
          return;
        }
        const transaction = transactionFromRow(payload.new as TransactionRow);
        setTransactions((current) => {
          const exists = current.some((item) => item.id === transaction.id);
          return (exists ? current.map((item) => item.id === transaction.id ? transaction : item) : [transaction, ...current]).slice(0, limit);
        });
        if (payload.eventType === "INSERT") {
          setNewCount((count) => count + 1);
          if (badgeTimer) clearTimeout(badgeTimer);
          badgeTimer = setTimeout(() => setNewCount(0), 5000);
        }
      }).subscribe();
    })();

    return () => {
      active = false;
      if (badgeTimer) clearTimeout(badgeTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [fallback, limit]);

  return { transactions, newCount };
}

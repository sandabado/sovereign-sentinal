"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Account, AccountType } from "@/lib/types";

type AccountRow = {
  id: string;
  owner_id: string | null;
  household_id: string | null;
  entity_id: string | null;
  plaid_account_id: string | null;
  name: string;
  type: AccountType;
  institution: string | null;
  balance: number | string;
  apr: number | string | null;
  credit_limit: number | string | null;
  min_payment: number | string | null;
  status: string;
  plaid_last_sync: string | null;
};

function accountFromRow(row: AccountRow): Account {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    householdId: row.household_id ?? undefined,
    entityId: row.entity_id ?? "personal",
    plaidAccountId: row.plaid_account_id ?? undefined,
    name: row.name,
    type: row.type,
    institution: row.institution ?? "Connected institution",
    balance: Number(row.balance),
    apr: row.apr == null ? undefined : Number(row.apr),
    creditLimit: row.credit_limit == null ? undefined : Number(row.credit_limit),
    minPayment: row.min_payment == null ? undefined : Number(row.min_payment),
    isActive: row.status === "active",
    lastSyncedAt: row.plaid_last_sync ?? undefined,
  };
}

export function useRealtimeAccounts(fallback: Account[]) {
  const [accounts, setAccounts] = useState(fallback);
  const [source, setSource] = useState<"seed" | "live">("seed");

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data } = await supabase.from("accounts").select("*").order("updated_at", { ascending: false });
      if (!active) return;
      setAccounts(((data ?? []) as AccountRow[]).map(accountFromRow));
      setSource("live");
      channel = supabase.channel(`accounts:${user.id}`).on("postgres_changes", {
        event: "*", schema: "public", table: "accounts",
      }, (payload) => {
        if (payload.eventType === "DELETE") {
          setAccounts((current) => current.filter((account) => account.id !== String(payload.old.id)));
          return;
        }
        const account = accountFromRow(payload.new as AccountRow);
        setSource("live");
        setAccounts((current) => {
          const exists = current.some((item) => item.id === account.id);
          return exists ? current.map((item) => item.id === account.id ? account : item) : [account, ...current];
        });
      }).subscribe();
    })();

    return () => {
      active = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [fallback]);

  return { accounts, source };
}

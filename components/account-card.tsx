"use client";

import { ChevronDown, Radio } from "lucide-react";
import { useState } from "react";
import type { Account } from "@/lib/types";
import { cn, formatCurrency, getSyncStatus } from "@/lib/utils";

const entityColors: Record<string, string> = {
  personal: "#777181",
  household: "#d7bd78",
  business: "#8b73ff",
};

export function AccountCard({ account }: { account: Account }) {
  const [expanded, setExpanded] = useState(false);
  const status = getSyncStatus(account.lastSyncedAt);
  const utilization = account.creditLimit ? Math.round((account.balance / account.creditLimit) * 100) : 0;

  return (
    <article className="sovereign-card overflow-hidden p-0 transition duration-200 hover:border-white/[0.14]">
      <button
        className="w-full p-5 text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <div className="mb-4 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[0.66rem] font-semibold uppercase tracking-[0.11em] text-[var(--muted)]">
            <i className="h-1.5 w-1.5 rounded-full" style={{ background: entityColors[account.entityId] }} />
            {account.entityId}
          </span>
          <span className="flex items-center gap-1.5 text-[0.66rem] text-[var(--muted)]">
            <Radio size={11} className={status === "fresh" ? "text-[var(--green)]" : status === "stale" ? "text-[var(--amber)]" : "text-[#625d69]"} />
            {status === "fresh" ? "Live" : status === "stale" ? "Needs sync" : "Manual"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{account.name}</h3>
            <p className="mt-1 truncate text-xs text-[var(--muted)]">{account.institution}</p>
          </div>
          <ChevronDown size={16} className={cn("mt-0.5 shrink-0 text-[var(--muted)] transition-transform", expanded && "rotate-180")} />
        </div>
        <p className="mt-6 text-2xl font-semibold tracking-[-0.04em]">{formatCurrency(account.balance)}</p>
        <div className="mt-2 flex items-center justify-between text-[0.68rem]">
          <span className="text-[var(--muted)]">Current balance</span>
          <span className={cn("rounded-full px-2 py-1 font-semibold", (account.apr ?? 0) >= 25 ? "bg-[rgba(239,125,120,.1)] text-[var(--critical)]" : "bg-[rgba(241,185,103,.1)] text-[var(--amber)]")}>{account.apr}% APR</span>
        </div>
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300", expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="mx-5 border-t border-white/[0.06] pb-5 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Credit utilization</span>
              <span>{utilization}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-[var(--purple)]" style={{ width: `${Math.min(utilization, 100)}%` }} />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Minimum payment</span>
              <span>{formatCurrency(account.minPayment ?? 0)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-[var(--muted)]">Credit limit</span>
              <span>{formatCurrency(account.creditLimit ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

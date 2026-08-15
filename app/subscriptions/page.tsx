"use client";

import { AlertTriangle, Check, Eye, Layers3, Plus, RotateCcw, Settings2, Sparkles, X } from "lucide-react";
import { motion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { ManageSubscriptionModal } from "@/components/manage-subscription-modal";
import { AnimatedNumber, AnimatedProgress, PageTransition, staggerContainer, staggerItem } from "@/components/motion";
import { useRealtimeSubscriptions } from "@/hooks/use-realtime-subscriptions";
import { useRealtimeTransactions } from "@/hooks/use-realtime-transactions";
import { auditSubscriptions } from "@/lib/subscription-engine";
import { visibleInFinancialView } from "@/lib/financial-view";
import { seedDashboard } from "@/lib/mock-data";
import type { Subscription, SubscriptionDraft, SubscriptionTransfer, SubscriptionUpdate } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

export default function SubscriptionsPage() {
  const { activeHouseholdId, activeUserId, currentViewMode, entities, user } = useAuth();
  const { transactions } = useRealtimeTransactions(seedDashboard.transactions, 500);
  const viewContext = useMemo(() => ({ mode: currentViewMode, activeUserId, userId: user?.id ?? null }), [activeUserId, currentViewMode, user?.id]);
  const visibleTransactions = useMemo(() => transactions.filter((transaction) => visibleInFinancialView(transaction, viewContext)), [transactions, viewContext]);
  const {
    subscriptions,
    source,
    createSubscription,
    updateSubscription,
    archiveSubscription,
    transferSubscription,
  } = useRealtimeSubscriptions(seedDashboard.subscriptions, visibleTransactions);
  const visibleSubscriptions = useMemo(() => subscriptions.filter((subscription) => visibleInFinancialView(subscription, viewContext)), [subscriptions, viewContext]);
  const audit = useMemo(() => auditSubscriptions(visibleSubscriptions), [visibleSubscriptions]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [planned, setPlanned] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "manage"; subscription: Subscription } | null>(null);
  const [notice, setNotice] = useState("");
  const recommendations = audit.recommendations.filter((recommendation) => !dismissed.has(recommendation.key));
  const recoverable = recommendations.filter((item) => item.type !== "price_alert").reduce((sum, item) => sum + item.potentialSavings, 0);
  const categoryTotals = Object.entries(audit.subscriptions.reduce<Record<string, number>>((totals, subscription) => ({ ...totals, [subscription.category]: (totals[subscription.category] ?? 0) + subscription.annualAmount }), {})).sort(([, left], [, right]) => right - left);
  const maxCategory = Math.max(...categoryTotals.map(([, value]) => value), 1);

  const plan = (key: string) => {
    setPlanned((current) => new Set(current).add(key));
  };

  const closeModal = useCallback(() => setModal(null), []);

  const showNotice = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  };

  const create = async (input: SubscriptionDraft) => {
    await createSubscription({
      ...input,
      ownerId: input.ownerId ?? activeUserId ?? user?.id,
      householdId: input.householdId ?? activeHouseholdId ?? undefined,
      entityId: input.entityId ?? (currentViewMode === "business" ? entities[0]?.id : undefined),
    });
    showNotice(`${input.name} added to Sentinel`);
  };

  const update = async (id: string, input: SubscriptionUpdate) => {
    const saved = await updateSubscription(id, input);
    showNotice(`${saved.name} updated`);
  };

  const archive = async (id: string, notes?: string) => {
    const item = visibleSubscriptions.find((subscription) => subscription.id === id);
    await archiveSubscription(id, notes);
    showNotice(`${item?.name ?? "Subscription"} archived in Sovereign`);
  };

  const transfer = async (id: string, input: SubscriptionTransfer) => {
    const saved = await transferSubscription(id, input);
    showNotice(`${saved.name} reassigned to the selected entity`);
  };

  return (
    <DashboardShell>
      <PageTransition>
        <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><Eye size={18} className="text-[var(--purple-bright)]" /><p className="eyebrow">Always watching</p></div>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.04em]">Subscription Sentinel</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">Recurring charges, overlap, and price changes in one quiet audit.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("w-fit rounded-full px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-wider", source === "live" ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-white/[0.05] text-[var(--muted)]")}>{source === "live" ? "Realtime active" : "Demo audit"}</span>
            <button onClick={() => setModal({ kind: "add" })} className="flex items-center gap-2 rounded-xl bg-[var(--purple)] px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-[rgba(139,115,255,.12)] transition hover:-translate-y-0.5 hover:brightness-110"><Plus size={15} /> Add subscription</button>
          </div>
        </header>

        <motion.section className="grid grid-cols-2 gap-3 xl:grid-cols-4" variants={staggerContainer} initial="initial" animate="animate">
          <motion.div variants={staggerItem} className="sovereign-card p-5"><p className="eyebrow">Monthly burn</p><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]"><AnimatedNumber value={audit.totalMonthly} format={formatCurrency} /></p><p className="mt-2 text-xs text-[var(--muted)]">{formatCurrency(audit.totalAnnual)} each year</p></motion.div>
          <motion.div variants={staggerItem} className="sovereign-card p-5"><p className="eyebrow">Active services</p><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{audit.subscriptions.length}</p><p className="mt-2 text-xs text-[var(--muted)]">{new Set(audit.subscriptions.map((item) => item.category)).size} categories</p></motion.div>
          <motion.div variants={staggerItem} className="sovereign-card p-5"><p className="eyebrow">Overlap groups</p><p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[var(--amber)]">{audit.overlapGroups.length}</p><p className="mt-2 text-xs text-[var(--muted)]">Redundancy detected</p></motion.div>
          <motion.div variants={staggerItem} className="sovereign-card p-5"><div className="flex items-center justify-between"><p className="eyebrow">Waste score</p><span className="text-sm font-semibold text-[var(--critical)]">{audit.wasteScore}%</span></div><div className="mt-5"><AnimatedProgress value={audit.wasteScore} color="var(--critical)" /></div><p className="mt-3 text-xs text-[var(--muted)]">{formatCurrency(recoverable)}/mo recoverable</p></motion.div>
        </motion.section>

        {recommendations.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex flex-wrap items-center gap-2"><Sparkles size={16} className="text-[var(--gold)]" /><h2 className="text-lg font-semibold">Sentinel recommendations</h2><span className="rounded-full bg-[rgba(85,217,154,.1)] px-2.5 py-1 text-[0.64rem] font-semibold text-[var(--green)]">Up to {formatCurrency(recoverable)}/mo</span></div>
            <div className="grid gap-3 xl:grid-cols-2">
              {recommendations.map((recommendation, index) => {
                const isPlanned = planned.has(recommendation.key);
                return <motion.article key={recommendation.key} className="sovereign-card p-5" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}>
                  <div className="flex items-start gap-3"><span className={cn("mt-0.5 rounded-full px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-wide", recommendation.type === "price_alert" ? "bg-[rgba(239,125,120,.1)] text-[var(--critical)]" : recommendation.type === "rotate" ? "bg-[rgba(241,185,103,.1)] text-[var(--amber)]" : "bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]")}>{recommendation.type.replace("_", " ")}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{recommendation.title}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{recommendation.body}</p></div><button onClick={() => setDismissed((current) => new Set(current).add(recommendation.key))} className="text-[var(--muted)] hover:text-white" aria-label={`Dismiss ${recommendation.title}`}><X size={15} /></button></div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3"><span className="text-xs font-semibold text-[var(--green)]">{recommendation.type === "price_alert" ? `+${formatCurrency(recommendation.potentialSavings)}/mo` : `${formatCurrency(recommendation.potentialSavings)}/mo potential`}</span>{recommendation.type !== "price_alert" && <button onClick={() => plan(recommendation.key)} disabled={isPlanned} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.68rem] font-semibold transition", isPlanned ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-white/[0.05] text-[var(--ink)] hover:bg-white/[0.08]")}>{isPlanned ? <Check size={13} /> : <RotateCcw size={13} />}{isPlanned ? "Added to plan" : "Plan cancellation"}</button>}</div>
                </motion.article>;
              })}
            </div>
          </section>
        )}

        {audit.overlapGroups.length > 0 && (
          <section className="mt-8">
            <div className="mb-4 flex items-center gap-2"><Layers3 size={16} className="text-[var(--amber)]" /><h2 className="text-lg font-semibold">Overlap detected</h2></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {audit.overlapGroups.map((group) => <article key={group.group} className="sovereign-card p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{group.displayName}</h3><span className="rounded-full bg-[rgba(241,185,103,.1)] px-2 py-1 text-[0.62rem] font-semibold text-[var(--amber)]">{group.subscriptions.length} services</span></div><div className="mt-4 space-y-2.5">{group.subscriptions.map((subscription) => <div key={subscription.id} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2"><i className="h-1.5 w-1.5 rounded-full bg-[var(--purple)]" />{subscription.name}</span><span className="text-[var(--muted)]">{formatCurrency(subscription.monthlyAmount)}/mo</span></div>)}</div><div className="mt-4 flex justify-between border-t border-white/[0.06] pt-3 text-xs"><span className="text-[var(--muted)]">Combined</span><span className="font-semibold text-[var(--amber)]">{formatCurrency(group.totalMonthly)}/mo</span></div></article>)}
            </div>
          </section>
        )}

        <section className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,.7fr)]">
          <div>
            <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Inventory</p><h2 className="mt-1 text-lg font-semibold">All subscriptions</h2></div><span className="text-xs text-[var(--muted)]">Highest cost first</span></div>
            <div className="sovereign-card overflow-hidden">
              {[...audit.subscriptions].sort((a, b) => b.monthlyAmount - a.monthlyAmount).map((subscription) => <div key={subscription.id} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white/[0.055] px-4 py-3.5 last:border-0 sm:grid-cols-[1fr_100px_85px_auto]"><div className="min-w-0"><p className="flex items-center gap-2 truncate text-xs font-semibold sm:text-sm">{subscription.flaggedForReview && <AlertTriangle size={13} className="shrink-0 text-[var(--amber)]" />}{subscription.name}</p><p className="mt-0.5 text-[0.65rem] text-[var(--muted)]">{subscription.category} · {subscription.frequency}{subscription.entityId ? " · Entity assigned" : ""}</p></div><span className="hidden text-right text-xs text-[var(--muted)] sm:block">{formatCurrency(subscription.annualAmount)}/yr</span><span className="hidden text-right text-sm font-semibold sm:block">{formatCurrency(subscription.monthlyAmount)}</span><button onClick={() => setModal({ kind: "manage", subscription })} className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-[0.67rem] font-semibold text-[var(--muted)] transition hover:border-[rgba(139,115,255,.28)] hover:bg-[rgba(139,115,255,.08)] hover:text-white" aria-label={`Manage ${subscription.name}`}><Settings2 size={13} /> Manage</button></div>)}
              {!audit.subscriptions.length && <div className="p-10 text-center text-sm text-[var(--muted)]">No recurring charges detected yet. Sentinel will keep watching new transactions.</div>}
            </div>
          </div>
          <article className="sovereign-card h-fit p-5 sm:p-6"><p className="eyebrow">Annual cost by category</p><div className="mt-5 space-y-4">{categoryTotals.map(([category, annual], index) => <div key={category}><div className="mb-1.5 flex justify-between text-xs"><span>{category}</span><span className="text-[var(--muted)]">{formatCurrency(annual)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><motion.div className="h-full rounded-full bg-[var(--purple)]" initial={{ width: 0 }} animate={{ width: `${annual / maxCategory * 100}%` }} transition={{ duration: 0.7, delay: index * 0.06 }} /></div></div>)}</div></article>
        </section>
      </PageTransition>
      {modal && (
        <ManageSubscriptionModal
          key={modal.kind === "manage" ? modal.subscription.id : "new-subscription"}
          subscription={modal.kind === "manage" ? modal.subscription : undefined}
          onClose={closeModal}
          onCreate={create}
          onUpdate={update}
          onArchive={archive}
          onTransfer={transfer}
        />
      )}
      {notice && <div role="status" className="fixed bottom-5 right-5 z-[90] flex max-w-sm items-center gap-2 rounded-xl border border-[rgba(85,217,154,.2)] bg-[#211d2a] px-4 py-3 text-xs shadow-2xl"><Check size={15} className="shrink-0 text-[var(--green)]" />{notice}</div>}
    </DashboardShell>
  );
}

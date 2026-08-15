"use client";

import { ArrowRight, BriefcaseBusiness, Building2, Crown, ShieldCheck, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useAuth, type HouseholdEntity } from "@/components/auth-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber, AnimatedProgress, PageTransition } from "@/components/motion";
import { useRealtimeAccounts } from "@/hooks/use-realtime-accounts";
import { formatCurrency } from "@/lib/utils";

const liabilityTypes = new Set(["credit", "loan", "mortgage"]);

export default function EntitiesPage() {
  const router = useRouter();
  const { activeUserId, currentViewMode, entities, user } = useAuth();
  const { accounts, source } = useRealtimeAccounts([]);
  const selectedOwnerId = activeUserId ?? user?.id ?? null;
  const visibleEntities = useMemo(
    () => currentViewMode === "personal" && selectedOwnerId
      ? entities.filter((entity) => entity.owner_id === selectedOwnerId)
      : entities,
    [currentViewMode, entities, selectedOwnerId],
  );
  const activeAccounts = useMemo(() => accounts.filter((account) => account.isActive), [accounts]);
  const assetAccounts = activeAccounts.filter((account) => !liabilityTypes.has(account.type) && account.balance > 0);
  const personalAssets = assetAccounts.filter((account) => !account.entityId || account.entityId === "personal").reduce((sum, account) => sum + account.balance, 0);
  const entityAssets = assetAccounts.filter((account) => visibleEntities.some((entity) => entity.id === account.entityId)).reduce((sum, account) => sum + account.balance, 0);
  const score = personalAssets + entityAssets > 0 ? Math.round(entityAssets / (personalAssets + entityAssets) * 100) : 0;

  return (
    <DashboardShell>
      <PageTransition>
        <header className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow">{currentViewMode === "business" ? "Entity watch" : currentViewMode === "personal" ? "Personal ownership map" : "Family ownership map"}</p>
            <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.04em]">Entity Architect</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">See where assets live today and keep legal ownership relationships explicit.</p>
          </div>
          <span className={`w-fit rounded-full px-2.5 py-1 text-[0.64rem] font-semibold uppercase tracking-wider ${source === "live" ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-white/[0.05] text-[var(--muted)]"}`}>{source === "live" ? "Realtime accounts" : "Awaiting connected data"}</span>
        </header>

        <section className="sovereign-card overflow-hidden p-6 sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2"><Sparkles size={16} className="text-[var(--purple-bright)]" /><p className="eyebrow">Ownership allocation</p></div>
              <p className="mt-3 text-5xl font-semibold tracking-[-0.06em] text-[var(--purple-bright)]"><AnimatedNumber value={score} format={(value) => `${Math.round(value)}%`} /></p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">The score reflects connected asset accounts assigned to a mapped entity. Treat it as an organization signal, not legal or tax advice.</p>
            </div>
            <div className="grid min-w-full grid-cols-2 gap-3 lg:min-w-[390px]">
              <div className="rounded-2xl bg-white/[0.035] p-4"><p className="text-[0.68rem] text-[var(--muted)]">Personal</p><p className="mt-2 text-xl font-semibold text-[var(--amber)]">{formatCurrency(personalAssets)}</p><p className="mt-1 text-[0.64rem] text-[var(--muted)]">Connected assets</p></div>
              <div className="rounded-2xl bg-white/[0.035] p-4"><p className="text-[0.68rem] text-[var(--muted)]">Entity-held</p><p className="mt-2 text-xl font-semibold text-[var(--green)]">{formatCurrency(entityAssets)}</p><p className="mt-1 text-[0.64rem] text-[var(--muted)]">Connected assets</p></div>
              <div className="col-span-2 rounded-2xl bg-white/[0.035] p-4"><div className="mb-2 flex justify-between text-[0.68rem]"><span className="text-[var(--muted)]">Mapped to entities</span><span>{score}%</span></div><AnimatedProgress value={score} /></div>
            </div>
          </div>
        </section>

        {visibleEntities.length ? (
          <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Mapped entities">
            {visibleEntities.map((entity, index) => <EntityCard key={entity.id} entity={entity} accounts={activeAccounts} index={index} />)}
          </section>
        ) : (
          <section className="sovereign-card mt-5 p-8 text-center">
            <Building2 className="mx-auto text-[var(--purple-bright)]" size={25} />
            <h2 className="mt-3 text-base font-semibold">No entities mapped in this view</h2>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[var(--muted)]">Add an LLC, trust, or holding company during onboarding, then associate eligible accounts and subscriptions with it.</p>
            <button onClick={() => router.push("/onboarding")} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--purple)] px-4 py-2.5 text-xs font-semibold text-white">Open onboarding <ArrowRight size={14} /></button>
          </section>
        )}

        <section className="sovereign-card mt-5 p-5 sm:p-6">
          <p className="eyebrow">Governance path</p>
          <div className="mt-5 flex items-center gap-3 overflow-x-auto pb-2">
            {[{ label: "Personal", icon: Building2 }, { label: "Operating entities", icon: BriefcaseBusiness }, { label: "Holding structure", icon: ShieldCheck }, { label: "Estate plan", icon: Crown }].map((step, index, list) => <div key={step.label} className="contents"><div className="flex min-w-32 flex-col items-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-4"><step.icon size={18} className={index === 0 ? "text-[var(--amber)]" : "text-[var(--purple-bright)]"} /><span className="text-center text-[0.68rem] font-medium">{step.label}</span></div>{index < list.length - 1 && <ArrowRight size={15} className="shrink-0 text-[var(--muted)]" />}</div>)}
          </div>
          <p className="mt-3 text-[0.68rem] leading-relaxed text-[var(--muted)]">Confirm formation, ownership, liability, and tax treatment with qualified advisors before moving assets or changing contracts.</p>
        </section>
      </PageTransition>
    </DashboardShell>
  );
}

function EntityCard({ entity, accounts, index }: { entity: HouseholdEntity; accounts: ReturnType<typeof useRealtimeAccounts>["accounts"]; index: number }) {
  const Icon = entity.type === "trust" ? Crown : entity.type === "personal" ? Building2 : BriefcaseBusiness;
  const linked = accounts.filter((account) => account.entityId === entity.id);
  const balance = linked.filter((account) => !liabilityTypes.has(account.type)).reduce((sum, account) => sum + Math.max(0, account.balance), 0);
  const relationship = entity.relationship_type?.replaceAll("_", " ") ?? "mapped entity";
  return (
    <motion.article className="sovereign-card p-5" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}>
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]"><Icon size={18} /></div><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{entity.name}</h2><p className="mt-0.5 text-[0.65rem] uppercase tracking-wider text-[var(--muted)]">{entity.type.replaceAll("_", " ")}</p></div><ShieldCheck size={14} className="ml-auto shrink-0 text-[var(--green)]" /></div>
      <p className="mt-4 text-xs capitalize text-[var(--muted)]">Relationship: {relationship}{entity.ownership_percentage != null ? ` · ${entity.ownership_percentage}%` : ""}</p>
      <div className="mt-5 grid grid-cols-2 border-t border-white/[0.06] pt-4"><div><p className="text-[0.65rem] text-[var(--muted)]">Assets mapped</p><p className="mt-1 text-lg font-semibold">{formatCurrency(balance)}</p></div><div><p className="text-[0.65rem] text-[var(--muted)]">Accounts</p><p className="mt-1 text-lg font-semibold">{linked.length}</p></div></div>
    </motion.article>
  );
}

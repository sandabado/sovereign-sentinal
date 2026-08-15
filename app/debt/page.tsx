"use client";

import { Award, CalendarDays, Snowflake, TrendingDown, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber, PageTransition, staggerContainer, staggerItem } from "@/components/motion";
import { compareStrategies, type StrategyKey } from "@/lib/debt-engine";
import { seedDashboard } from "@/lib/mock-data";
import { cn, formatCurrency } from "@/lib/utils";

const meta = {
  blizzard: { label: "Blizzard", icon: Snowflake, description: "Quick wins first, then highest APR." },
  avalanche: { label: "Avalanche", icon: TrendingDown, description: "Highest APR first. Lowest interest." },
  snowball: { label: "Snowball", icon: Zap, description: "Smallest balance first. Fast momentum." },
} satisfies Record<StrategyKey, { label: string; icon: typeof Snowflake; description: string }>;

export default function DebtPage() {
  const [strategy, setStrategy] = useState<StrategyKey>("blizzard");
  const [extraMonthly, setExtraMonthly] = useState(1500);
  const comparison = useMemo(() => compareStrategies(seedDashboard.debts, extraMonthly), [extraMonthly]);
  const plan = comparison[strategy];
  const debtFree = new Date(plan.debtFreeDate);
  const totalPrincipal = seedDashboard.debts.reduce((sum, debt) => sum + debt.balance, 0);

  return (
    <DashboardShell>
      <PageTransition>
        <header className="mb-7">
          <p className="eyebrow">Your exit map</p>
          <h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.04em]">Debt Conductor</h1>
          <p className="mt-1.5 text-sm text-[var(--muted)]">Direct your surplus. Watch every payment unlock the next.</p>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {(Object.keys(meta) as StrategyKey[]).map((key) => {
            const item = meta[key];
            const Icon = item.icon;
            const itemPlan = comparison[key];
            const selected = strategy === key;
            return (
              <button key={key} onClick={() => setStrategy(key)} className={cn("sovereign-card p-5 text-left transition hover:-translate-y-0.5", selected && "border-[rgba(139,115,255,.6)] bg-[rgba(139,115,255,.08)]")} aria-pressed={selected}>
                <div className="flex items-center gap-2.5"><Icon size={17} className={selected ? "text-[var(--purple-bright)]" : "text-[var(--muted)]"} /><h2 className="text-sm font-semibold">{item.label}</h2>{comparison.best.strategy === key && <span className="ml-auto flex items-center gap-1 rounded-full bg-[rgba(215,189,120,.1)] px-2 py-1 text-[0.62rem] font-semibold text-[var(--gold)]"><Award size={11} />Best rate</span>}</div>
                <p className="mt-2 text-xs text-[var(--muted)]">{item.description}</p>
                <div className="mt-5 flex items-end justify-between"><p className="text-xl font-semibold tracking-tight">{formatCurrency(itemPlan.totalInterestPaid)}</p><p className="text-[0.68rem] text-[var(--muted)]">{itemPlan.totalMonths} months</p></div>
                <p className="mt-0.5 text-[0.65rem] text-[var(--muted)]">projected interest</p>
              </button>
            );
          })}
        </section>

        <section className="sovereign-card mt-5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><label htmlFor="extra-payment" className="eyebrow">Extra monthly payment</label><p className="mt-1 text-3xl font-semibold tracking-[-0.04em] text-[var(--purple-bright)]"><AnimatedNumber value={extraMonthly} format={formatCurrency} /></p></div>
            <div className="sm:text-right"><p className="text-xs text-[var(--muted)]">Projected debt-free date</p><p className="mt-1 text-xl font-semibold">{debtFree.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p></div>
          </div>
          <input id="extra-payment" type="range" min="0" max="5000" step="100" value={extraMonthly} onChange={(event) => setExtraMonthly(Number(event.target.value))} className="mt-6 w-full accent-[var(--purple)]" />
          <div className="mt-1.5 flex justify-between text-[0.65rem] text-[var(--muted)]"><span>$0</span><span>$2,500</span><span>$5,000</span></div>
        </section>

        <motion.section className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4" variants={staggerContainer} initial="initial" animate="animate">
          {[
            ["Principal mapped", formatCurrency(totalPrincipal)],
            ["Months to freedom", `${plan.totalMonths}`],
            ["Projected interest", formatCurrency(plan.totalInterestPaid)],
            ["Total plan cost", formatCurrency(plan.totalPaid)],
          ].map(([label, value]) => <motion.div key={label} variants={staggerItem} className="sovereign-card p-5"><p className="eyebrow">{label}</p><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{value}</p></motion.div>)}
        </motion.section>

        <section className="sovereign-card mt-5 p-5 sm:p-6">
          <div className="flex items-center gap-2"><CalendarDays size={17} className="text-[var(--purple-bright)]" /><h2 className="text-lg font-semibold">Payoff sequence</h2></div>
          <p className="mt-1 text-xs text-[var(--muted)]">The brighter band shows when your extra payment is focused on each debt.</p>
          <div className="mt-6 space-y-5">
            {plan.steps.map((step, index) => {
              const left = ((step.startMonth - 1) / plan.totalMonths) * 100;
              const width = Math.max(((step.payoffMonth - step.startMonth + 1) / plan.totalMonths) * 100, 1.2);
              return (
                <div key={step.debtId}>
                  <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><span className="text-xs font-semibold sm:text-sm">{step.debtName}</span><span className={cn("rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide", step.phase === "quick_kill" ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]")}>{step.phase.replace("_", " ")}</span></div><span className="text-[0.68rem] text-[var(--muted)]">{step.apr}% · {formatCurrency(step.startBalance)} · month {step.payoffMonth}</span></div>
                  <div className="relative h-7 overflow-hidden rounded-lg bg-white/[0.04]">
                    <motion.div className="absolute inset-y-0 rounded-lg bg-[linear-gradient(90deg,#6f59dc,#9d89ff)]" initial={{ width: 0 }} animate={{ left: `${left}%`, width: `${width}%` }} transition={{ duration: 0.7, delay: index * 0.07 }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[0.65rem] text-[var(--muted)]"><span>Attack up to {formatCurrency(step.monthlyPayment)}/mo</span><span>{formatCurrency(step.totalInterestPaid)} interest</span></div>
                </div>
              );
            })}
          </div>
        </section>
      </PageTransition>
    </DashboardShell>
  );
}

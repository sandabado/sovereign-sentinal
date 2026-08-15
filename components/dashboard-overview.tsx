"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  ArrowRightLeft,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  DollarSign,
  Plus,
  Repeat2,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AddEventModal, type AddEventQuickType } from "@/components/add-event-modal";
import { useAuth } from "@/components/auth-provider";
import { ConnectBankButton } from "@/components/connect-bank-button";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber, AnimatedProgress, PageTransition, staggerContainer, staggerItem } from "@/components/motion";
import { useRealtimeAccounts } from "@/hooks/use-realtime-accounts";
import { useRealtimeCalendar } from "@/hooks/use-realtime-calendar";
import { buildCalendarMonth, formatISODate, getUpcomingBills, parseISODate, seedCalendarEvents } from "@/lib/calendar-engine";
import type { BillInstance, CalendarDay, NewCalendarEvent } from "@/lib/calendar-types";
import { visibleInFinancialView } from "@/lib/financial-view";
import { seedDashboard } from "@/lib/mock-data";
import { cn, formatCurrency } from "@/lib/utils";

const weekdays = ["S", "M", "T", "W", "T", "F", "S"];
const liabilityTypes = new Set(["credit", "loan", "mortgage"]);

type DrillDown = "today" | "week" | "month" | null;

export function DashboardOverview() {
  const router = useRouter();
  const { user, currentViewMode, activeUserId } = useAuth();
  const [today] = useState(() => new Date());
  const [displayMonth, setDisplayMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [drillDown, setDrillDown] = useState<DrillDown>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<AddEventQuickType>();
  const [toast, setToast] = useState("");
  const [seedEvents] = useState(() => seedCalendarEvents(today));
  const { events, source: calendarSource, addEvent } = useRealtimeCalendar(seedEvents);
  const { accounts, source: accountSource } = useRealtimeAccounts(seedDashboard.accounts);
  const viewContext = useMemo(() => ({ mode: currentViewMode, activeUserId, userId: user?.id ?? null }), [activeUserId, currentViewMode, user?.id]);
  const relevantEvents = useMemo(() => events.filter((event) => visibleInFinancialView(event, viewContext)), [events, viewContext]);
  const relevantAccounts = useMemo(() => accounts.filter((account) => visibleInFinancialView(account, viewContext)), [accounts, viewContext]);

  const currentMonth = useMemo(
    () => buildCalendarMonth(today.getFullYear(), today.getMonth(), relevantEvents),
    [relevantEvents, today],
  );
  const visibleMonth = useMemo(
    () => buildCalendarMonth(displayMonth.getFullYear(), displayMonth.getMonth(), relevantEvents),
    [displayMonth, relevantEvents],
  );
  const upcoming = useMemo(() => getUpcomingBills(relevantEvents, 45), [relevantEvents]);
  const overdue = upcoming.filter((bill) => bill.isOverdue);
  const dueToday = upcoming.filter((bill) => bill.daysUntil === 0);
  const daysToWeekEnd = 6 - today.getDay();
  const daysToMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate();
  const dueThisWeek = upcoming.filter((bill) => bill.daysUntil >= 0 && bill.daysUntil <= daysToWeekEnd);
  const dueThisMonth = upcoming.filter((bill) => bill.daysUntil >= 0 && bill.daysUntil <= daysToMonthEnd);
  const activeDebts = accountSource === "live"
    ? relevantAccounts.filter((account) => account.isActive && liabilityTypes.has(account.type) && account.balance > 0).length
    : seedDashboard.debts.length;

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const openEvent = (type?: AddEventQuickType) => {
    setModalType(type);
    setModalOpen(true);
  };
  const closeEvent = () => {
    setModalOpen(false);
    setModalType(undefined);
  };
  const saveEvent = async (event: NewCalendarEvent) => {
    await addEvent(event);
    notify("Event secured on your financial timeline.");
  };
  const navigateMonth = (direction: number) => {
    setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1, 12));
  };

  return (
    <DashboardShell>
      <PageTransition>
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">{currentViewMode === "family" ? "Family command center" : currentViewMode === "business" ? "Entity watch" : "Personal command center"}</p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
              {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
              {overdue.length ? `${overdue.length} overdue item${overdue.length === 1 ? "" : "s"}.` : "All clear."} {dueToday.length ? `${dueToday.length} due today.` : "Nothing due today."}
              <span className={cn("rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider", calendarSource === "live" ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-white/[0.05]")}>{calendarSource === "live" ? "Live" : "Seed data"}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push("/calendar")} className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025] text-[var(--muted)] transition hover:text-white" aria-label="Open financial calendar">
              <Bell size={17} />
              {(overdue.length > 0 || dueToday.length > 0) && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--critical)]" />}
            </button>
            <button onClick={() => openEvent()} className="flex items-center gap-2 rounded-xl bg-[var(--purple)] px-3.5 py-2.5 text-xs font-semibold text-white shadow-[0_8px_28px_rgba(139,115,255,.22)] transition hover:bg-[var(--purple-bright)]"><Plus size={15} />Add event</button>
          </div>
        </header>

        <AnimatePresence>
          {overdue.length > 0 && <motion.section initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-6 flex flex-col gap-3 rounded-2xl border border-[rgba(239,125,120,.22)] bg-[rgba(239,125,120,.06)] p-4 sm:flex-row sm:items-center">
            <AlertCircle size={19} className="shrink-0 text-[var(--critical)]" />
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[var(--critical)]">{overdue.length} overdue bill{overdue.length === 1 ? "" : "s"}</p><p className="mt-0.5 truncate text-xs text-[var(--muted)]">{overdue.map((bill) => bill.title).join(", ")} · {formatCurrency(totalDue(overdue))}</p></div>
            <button onClick={() => router.push("/calendar")} className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--critical)] px-3.5 py-2 text-xs font-semibold text-white">Resolve <ArrowRight size={13} /></button>
          </motion.section>}
        </AnimatePresence>

        <section aria-labelledby="due-title">
          <p id="due-title" className="eyebrow mb-3">What&apos;s Due</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <DueCard label="Today" icon={Clock3} color="var(--critical)" bills={dueToday} open={drillDown === "today"} onToggle={() => setDrillDown(drillDown === "today" ? null : "today")} />
            <DueCard label="This Week" icon={CalendarDays} color="var(--amber)" bills={dueThisWeek} open={drillDown === "week"} onToggle={() => setDrillDown(drillDown === "week" ? null : "week")} />
            <DueCard label="This Month" icon={CreditCard} color="var(--purple-bright)" bills={dueThisMonth} open={drillDown === "month"} onToggle={() => setDrillDown(drillDown === "month" ? null : "month")} />
          </div>
        </section>

        <section className="mt-7" aria-labelledby="position-title">
          <p id="position-title" className="eyebrow mb-3">Financial Position</p>
          <motion.div className="grid grid-cols-2 gap-3 xl:grid-cols-4" variants={staggerContainer} initial="initial" animate="animate">
            <PositionCard label="Net income" value={currentMonth.net} icon={TrendingUp} color={currentMonth.net >= 0 ? "var(--green)" : "var(--critical)"} detail={`${formatCurrency(currentMonth.totalIncome)} in · ${formatCurrency(currentMonth.totalExpenses)} out`} onClick={() => router.push("/calendar")} />
            <PositionCard label="Monthly burn" value={currentMonth.totalExpenses} icon={TrendingDown} color="var(--amber)" detail="Open recurring costs" onClick={() => router.push("/subscriptions")} />
            <motion.button variants={staggerItem} onClick={() => router.push("/debt")} className="sovereign-card p-5 text-left transition hover:-translate-y-0.5"><div className="flex items-center gap-2 text-[var(--critical)]"><CreditCard size={14} /><p className="eyebrow">Active debts</p></div><p className="mt-3 text-2xl font-semibold">{activeDebts}</p><p className="mt-2 text-[0.65rem] text-[var(--muted)]">{accountSource === "live" ? "Connected liabilities" : "Run the Debt Conductor"}</p></motion.button>
            <motion.button variants={staggerItem} onClick={() => router.push("/entities")} className="sovereign-card p-5 text-left transition hover:-translate-y-0.5"><div className="flex items-center gap-2 text-[var(--purple-bright)]"><Target size={14} /><p className="eyebrow">Sovereignty</p></div><p className="mt-3 text-2xl font-semibold text-[var(--purple-bright)]">0%</p><div className="mt-3"><AnimatedProgress value={0} /></div></motion.button>
          </motion.div>
        </section>

        <section className="mt-7" aria-labelledby="actions-title">
          <p id="actions-title" className="eyebrow mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <QuickAction label="Log Income" icon={DollarSign} color="var(--green)" onClick={() => openEvent("income_once")} />
            <QuickAction label="Add Bill" icon={CalendarDays} color="var(--amber)" onClick={() => openEvent("bill_recurring")} />
            <QuickAction label="Pay Debt" icon={CreditCard} color="var(--critical)" onClick={() => router.push("/debt")} />
            <ConnectBankButton variant="quick" onConnected={() => notify("Bank connected. Live data will arrive as Plaid finishes syncing.")} />
            <QuickAction label="Review Subs" icon={Repeat2} color="var(--gold)" onClick={() => router.push("/subscriptions")} />
            <QuickAction label="Transfer" icon={ArrowRightLeft} color="var(--muted)" onClick={() => openEvent("transfer")} />
          </div>
        </section>

        <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
          <MiniCalendar month={visibleMonth.month} days={visibleMonth.days} title={`${visibleMonth.monthName} ${visibleMonth.year}`} onPrevious={() => navigateMonth(-1)} onNext={() => navigateMonth(1)} onFullView={() => router.push("/calendar")} />
          <section className="sovereign-card p-5" aria-labelledby="next-up-title">
            <div className="flex items-center justify-between"><div><p className="eyebrow">Timeline</p><h2 id="next-up-title" className="mt-1 text-lg font-semibold">Next Up</h2></div><button onClick={() => router.push("/calendar")} className="text-xs font-semibold text-[var(--purple-bright)]">View all</button></div>
            <div className="mt-4 space-y-2.5">{upcoming.filter((bill) => !bill.isOverdue).slice(0, 6).map((bill) => <UpcomingRow key={bill.eventId} bill={bill} />)}{!upcoming.some((bill) => !bill.isOverdue) && <div className="rounded-xl bg-white/[0.025] px-4 py-8 text-center"><Check size={18} className="mx-auto text-[var(--green)]" /><p className="mt-2 text-xs text-[var(--muted)]">Nothing due. You&apos;re clear.</p></div>}</div>
          </section>
        </div>
      </PageTransition>

      {modalOpen && <AddEventModal open initialType={modalType} onClose={closeEvent} onSubmit={saveEvent} />}
      {toast && <div role="status" className="fixed bottom-5 right-5 z-[80] flex items-center gap-2 rounded-xl border border-[rgba(85,217,154,.2)] bg-[#211d2a] px-4 py-3 text-xs shadow-2xl"><Check size={15} className="text-[var(--green)]" />{toast}</div>}
    </DashboardShell>
  );
}

function totalDue(bills: BillInstance[]) {
  return bills.reduce((sum, bill) => sum + bill.amount, 0);
}

function DueCard({ label, icon: Icon, color, bills, open, onToggle }: { label: string; icon: typeof Clock3; color: string; bills: BillInstance[]; open: boolean; onToggle: () => void }) {
  return <motion.button type="button" onClick={onToggle} aria-expanded={open} className="sovereign-card p-5 text-left transition hover:-translate-y-0.5" whileTap={{ scale: 0.995 }}><div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold"><Icon size={15} style={{ color }} />{label}</span><span className="rounded-full px-2 py-0.5 text-[0.62rem] font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{bills.length}</span></div><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]"><AnimatedNumber value={totalDue(bills)} format={formatCurrency} /></p><AnimatePresence initial={false}>{open && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-3 space-y-2 overflow-hidden border-t border-white/[0.06] pt-3">{bills.length ? bills.slice(0, 6).map((bill) => <span key={bill.eventId} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-[var(--muted)]">{bill.title}</span><span className="shrink-0 font-semibold" style={{ color }}>{formatCurrency(bill.amount)}</span></span>) : <span className="block text-xs text-[var(--muted)]">Nothing due.</span>}</motion.div>}</AnimatePresence></motion.button>;
}

function PositionCard({ label, value, icon: Icon, color, detail, onClick }: { label: string; value: number; icon: typeof TrendingUp; color: string; detail: string; onClick: () => void }) {
  return <motion.button variants={staggerItem} onClick={onClick} className="sovereign-card p-5 text-left transition hover:-translate-y-0.5"><div className="flex items-center gap-2"><Icon size={14} style={{ color }} /><p className="eyebrow">{label}</p></div><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]" style={{ color }}><AnimatedNumber value={value} format={formatCurrency} /></p><p className="mt-2 truncate text-[0.65rem] text-[var(--muted)]">{detail}</p></motion.button>;
}

function QuickAction({ label, icon: Icon, color, onClick }: { label: string; icon: typeof DollarSign; color: string; onClick: () => void }) {
  return <motion.button onClick={onClick} className="sovereign-card flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-xs font-semibold transition hover:-translate-y-0.5" whileTap={{ scale: 0.98 }}><span className="grid h-10 w-10 place-items-center rounded-full" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}><Icon size={18} /></span>{label}</motion.button>;
}

function MiniCalendar({ month, days, title, onPrevious, onNext, onFullView }: { month: number; days: CalendarDay[]; title: string; onPrevious: () => void; onNext: () => void; onFullView: () => void }) {
  return <section className="sovereign-card p-4 sm:p-5" aria-labelledby="mini-calendar-title"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><CalendarDays size={17} className="text-[var(--purple-bright)]" /><h2 id="mini-calendar-title" className="text-sm font-semibold">{title}</h2></div><div className="flex items-center gap-1"><button onClick={onPrevious} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/[0.04] hover:text-white" aria-label="Previous month"><ChevronLeft size={15} /></button><button onClick={onNext} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-white/[0.04] hover:text-white" aria-label="Next month"><ChevronRight size={15} /></button><button onClick={onFullView} className="ml-1 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[0.65rem] font-semibold text-[var(--muted)] hover:text-white">Full view</button></div></div><div className="mt-4 grid grid-cols-7 gap-1">{weekdays.map((day, index) => <div key={`${day}-${index}`} className="py-1 text-center text-[0.58rem] font-semibold text-[var(--muted)]">{day}</div>)}{days.map((day) => { const date = parseISODate(day.date); const inMonth = date.getMonth() === month; const income = day.events.some((event) => event.amount > 0); const expense = day.events.some((event) => event.amount < 0); const missed = day.events.some((event) => event.status === "missed"); return <button key={day.date} onClick={onFullView} aria-label={`Open ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })} in calendar`} className={cn("relative min-h-12 rounded-lg border border-transparent py-1.5 text-xs transition hover:border-white/[0.08]", inMonth ? "bg-white/[0.022]" : "opacity-25", day.date === formatISODate(new Date()) && "border-[rgba(139,115,255,.48)] text-[var(--purple-bright)]")}><span className={day.isToday ? "font-bold" : undefined}>{date.getDate()}</span><span className="mt-1 flex justify-center gap-0.5">{income && <span className="h-1 w-1 rounded-full bg-[var(--green)]" />}{expense && <span className="h-1 w-1 rounded-full bg-[var(--amber)]" />}{missed && <span className="h-1 w-1 rounded-full bg-[var(--critical)]" />}</span></button>; })}</div><div className="mt-4 flex flex-wrap justify-center gap-4 border-t border-white/[0.06] pt-3 text-[0.58rem] text-[var(--muted)]"><Legend color="var(--green)" label="Income" /><Legend color="var(--amber)" label="Outflow" /><Legend color="var(--critical)" label="Missed" /></div></section>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />{label}</span>;
}

function UpcomingRow({ bill }: { bill: BillInstance }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.025] p-3"><div className="flex min-w-0 items-center gap-2.5"><span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.62rem] font-bold", bill.daysUntil <= 3 ? "bg-[rgba(241,185,103,.12)] text-[var(--amber)]" : "bg-white/[0.05] text-[var(--muted)]")}>{bill.daysUntil}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{bill.title}</p><p className="mt-0.5 text-[0.6rem] text-[var(--muted)]">{bill.daysUntil === 0 ? "Due today" : `In ${bill.daysUntil} days`}{bill.isRecurring ? " · Recurring" : ""}</p></div></div><span className="shrink-0 text-xs font-semibold text-[var(--amber)]">{formatCurrency(bill.amount)}</span></div>;
}

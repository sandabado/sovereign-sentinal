"use client";

import { AlertCircle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { AddEventModal } from "@/components/add-event-modal";
import { useAuth } from "@/components/auth-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { AnimatedNumber, PageTransition, staggerContainer, staggerItem } from "@/components/motion";
import { useRealtimeCalendar } from "@/hooks/use-realtime-calendar";
import { buildCalendarDay, buildCalendarMonth, buildCalendarYear, expandEvents, formatISODate, getUpcomingBills, parseISODate, seedCalendarEvents } from "@/lib/calendar-engine";
import type { CalendarDay, CalendarEvent, CalendarViewMode } from "@/lib/calendar-types";
import { visibleInFinancialView } from "@/lib/financial-view";
import { cn, formatCurrency } from "@/lib/utils";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const seedEvents = seedCalendarEvents();
const eventStyle = {
  income: { color: "var(--green)", background: "rgba(85,217,154,.09)", label: "Income" },
  bill: { color: "var(--amber)", background: "rgba(241,185,103,.09)", label: "Bill" },
  debt_payment: { color: "var(--critical)", background: "rgba(239,125,120,.09)", label: "Debt" },
  subscription: { color: "var(--purple-bright)", background: "rgba(139,115,255,.09)", label: "Subscription" },
  transfer: { color: "var(--muted)", background: "rgba(148,143,163,.08)", label: "Transfer" },
  investment: { color: "var(--gold)", background: "rgba(215,189,120,.09)", label: "Investment" },
  tax: { color: "var(--critical)", background: "rgba(239,125,120,.09)", label: "Tax" },
  custom: { color: "var(--muted)", background: "rgba(148,143,163,.08)", label: "Other" },
};

function ownerColor(ownerId?: string) {
  if (!ownerId) return undefined;
  const palette = ["#8b73ff", "#f1b967", "#55d99a", "#ef7d78", "#d7bd78"];
  const hash = [...ownerId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export default function CalendarPage() {
  const { user, currentViewMode, activeUserId } = useAuth();
  const [viewDate, setViewDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [selectedDate, setSelectedDate] = useState(() => formatISODate(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const { events, source, addEvent } = useRealtimeCalendar(seedEvents);
  const viewContext = useMemo(() => ({ mode: currentViewMode, activeUserId, userId: user?.id ?? null }), [activeUserId, currentViewMode, user?.id]);
  const relevantEvents = useMemo(() => events.filter((event) => visibleInFinancialView(event, viewContext)), [events, viewContext]);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthData = useMemo(() => buildCalendarMonth(year, month, relevantEvents), [relevantEvents, month, year]);
  const yearData = useMemo(() => buildCalendarYear(year, relevantEvents), [relevantEvents, year]);
  const expandedSelected = useMemo(() => expandEvents(relevantEvents, parseISODate(selectedDate), parseISODate(selectedDate)), [relevantEvents, selectedDate]);
  const selectedDay = useMemo(() => buildCalendarDay(parseISODate(selectedDate), expandedSelected), [expandedSelected, selectedDate]);
  const selectedWeek = monthData.weeks.find((week) => week.days.some((day) => day.date === selectedDate)) ?? monthData.weeks[0];
  const upcoming = useMemo(() => getUpcomingBills(relevantEvents, 30), [relevantEvents]);

  const navigate = (direction: number) => {
    const next = new Date(viewDate);
    if (viewMode === "day") next.setDate(next.getDate() + direction);
    if (viewMode === "week") next.setDate(next.getDate() + direction * 7);
    if (viewMode === "month") next.setMonth(next.getMonth() + direction);
    if (viewMode === "year") next.setFullYear(next.getFullYear() + direction);
    setViewDate(next);
    setSelectedDate(formatISODate(next));
  };
  const today = () => {
    const now = new Date();
    setViewDate(now);
    setSelectedDate(formatISODate(now));
  };
  const title = viewMode === "year" ? String(year) : viewMode === "day" ? parseISODate(selectedDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : `${monthData.monthName} ${year}`;

  return (
    <DashboardShell>
      <PageTransition>
        <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><div className="flex items-center gap-2"><CalendarDays size={18} className="text-[var(--purple-bright)]" /><p className="eyebrow">{currentViewMode === "family" ? "Family timeline" : currentViewMode === "business" ? "Entity timeline" : "Personal timeline"}</p></div><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.04em]">{title}</h1><p className="mt-1.5 flex items-center gap-2 text-sm text-[var(--muted)]">Every dollar anchored to a date. <span className={cn("rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider", source === "live" ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-white/[0.05]")}>{source === "live" ? "Live" : "Seed data"}</span></p></div>
          <div className="flex flex-wrap items-center gap-2"><div className="flex rounded-xl bg-white/[0.035] p-1" role="tablist">{(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => <button key={mode} onClick={() => setViewMode(mode)} className={cn("rounded-lg px-3 py-2 text-xs font-semibold capitalize transition", viewMode === mode ? "bg-[var(--purple)] text-white" : "text-[var(--muted)] hover:text-white")} role="tab" aria-selected={viewMode === mode}>{mode}</button>)}</div><button onClick={today} className="rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-[var(--muted)] hover:text-white">Today</button><button onClick={() => navigate(-1)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] text-[var(--muted)] hover:text-white" aria-label={`Previous ${viewMode}`}><ChevronLeft size={16} /></button><button onClick={() => navigate(1)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] text-[var(--muted)] hover:text-white" aria-label={`Next ${viewMode}`}><ChevronRight size={16} /></button><button onClick={() => setModalOpen(true)} className="flex items-center gap-2 rounded-xl bg-[var(--purple)] px-3.5 py-2.5 text-xs font-semibold text-white"><Plus size={14} />Add event</button></div>
        </header>

        <motion.section className="grid grid-cols-2 gap-3 xl:grid-cols-4" variants={staggerContainer} initial="initial" animate="animate">
          <Metric icon={TrendingUp} label="Income" value={monthData.totalIncome} color="var(--green)" />
          <Metric icon={TrendingDown} label="Expenses" value={monthData.totalExpenses} color="var(--amber)" />
          <Metric label="Net cash flow" value={monthData.net} color={monthData.net >= 0 ? "var(--green)" : "var(--critical)"} />
          <motion.div variants={staggerItem} className="sovereign-card p-5"><p className="eyebrow">Bills this month</p><p className="mt-3 text-2xl font-semibold">{monthData.billsDue}</p><div className="mt-2 flex gap-3 text-[0.65rem]"><span className="flex items-center gap-1 text-[var(--green)]"><CheckCircle2 size={11} />{monthData.billsPaid} paid</span><span className="flex items-center gap-1 text-[var(--amber)]"><Clock3 size={11} />{monthData.billsUpcoming} upcoming</span>{monthData.billsMissed > 0 && <span className="flex items-center gap-1 text-[var(--critical)]"><AlertCircle size={11} />{monthData.billsMissed}</span>}</div></motion.div>
        </motion.section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(310px,.65fr)]">
          <div>
            {viewMode === "month" && <MonthView month={month} days={monthData.days} selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setViewDate(parseISODate(date)); }} />}
            {viewMode === "week" && <WeekView days={selectedWeek.days} selectedDate={selectedDate} onSelect={(date) => { setSelectedDate(date); setViewDate(parseISODate(date)); }} />}
            {viewMode === "day" && <DayView day={selectedDay} />}
            {viewMode === "year" && <YearView year={yearData} onSelect={(targetMonth) => { const next = new Date(year, targetMonth, 1, 12); setViewDate(next); setSelectedDate(formatISODate(next)); setViewMode("month"); }} />}

            {viewMode === "month" && <section className="sovereign-card mt-4 p-5"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow">Selected day</p><h2 className="mt-1 text-lg font-semibold">{parseISODate(selectedDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2></div><button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[rgba(139,115,255,.1)] px-3 py-2 text-xs font-semibold text-[var(--purple-bright)]"><Plus size={13} />Add here</button></div><EventList events={selectedDay.events} empty="Nothing scheduled for this day." /></section>}
          </div>

          <aside className="space-y-4">
            <section className="sovereign-card p-5"><div className="flex items-center gap-2"><Clock3 size={16} className="text-[var(--amber)]" /><h2 className="text-lg font-semibold">Upcoming bills</h2></div><p className="mt-1 text-xs text-[var(--muted)]">Next 30 days and anything overdue</p><div className="mt-5 space-y-2.5">{upcoming.slice(0, 12).map((bill) => <div key={bill.eventId} className={cn("flex items-center justify-between gap-3 rounded-xl p-3", bill.isOverdue ? "bg-[rgba(239,125,120,.07)]" : "bg-white/[0.025]")}><div className="flex min-w-0 items-center gap-2.5"><span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.62rem] font-bold", bill.isOverdue ? "bg-[rgba(239,125,120,.12)] text-[var(--critical)]" : bill.daysUntil <= 3 ? "bg-[rgba(241,185,103,.12)] text-[var(--amber)]" : "bg-white/[0.05] text-[var(--muted)]")}>{bill.isOverdue ? "!" : bill.daysUntil}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{bill.title}</p><p className="mt-0.5 text-[0.62rem] text-[var(--muted)]">{bill.isOverdue ? `${Math.abs(bill.daysUntil)} days overdue` : bill.daysUntil === 0 ? "Due today" : `In ${bill.daysUntil} days`}</p></div></div><span className="text-xs font-semibold text-[var(--amber)]">{formatCurrency(bill.amount)}</span></div>)}{!upcoming.length && <p className="py-6 text-center text-xs text-[var(--muted)]">Nothing due in the next 30 days.</p>}</div>{upcoming.length > 0 && <div className="mt-4 flex justify-between border-t border-white/[0.06] pt-3 text-xs"><span className="text-[var(--muted)]">Total due</span><span className="font-semibold text-[var(--amber)]">{formatCurrency(upcoming.reduce((sum, bill) => sum + bill.amount, 0))}</span></div>}</section>
            <section className="sovereign-card p-5"><p className="eyebrow">{monthData.monthName} summary</p><div className="mt-4 space-y-3 text-xs"><SummaryRow label="Dated events" value={String(monthData.days.reduce((sum, day) => sum + day.events.length, 0))} /><SummaryRow label="Bills paid" value={String(monthData.billsPaid)} color="var(--green)" /><SummaryRow label="Bills upcoming" value={String(monthData.billsUpcoming)} color="var(--amber)" /><SummaryRow label="Net flow" value={formatCurrency(monthData.net)} color={monthData.net >= 0 ? "var(--green)" : "var(--critical)"} /></div></section>
          </aside>
        </div>
      </PageTransition>
      {modalOpen && <AddEventModal open defaultDate={selectedDate} onClose={() => setModalOpen(false)} onSubmit={addEvent} />}
    </DashboardShell>
  );
}

function Metric({ icon: Icon, label, value, color }: { icon?: typeof TrendingUp; label: string; value: number; color: string }) { return <motion.div variants={staggerItem} className="sovereign-card p-5"><div className="flex items-center gap-2">{Icon && <Icon size={14} style={{ color }} />}<p className="eyebrow">{label}</p></div><p className="mt-3 text-2xl font-semibold tracking-[-0.04em]" style={{ color }}><AnimatedNumber value={value} format={formatCurrency} /></p></motion.div>; }

function MonthView({ month, days, selectedDate, onSelect }: { month: number; days: CalendarDay[]; selectedDate: string; onSelect: (date: string) => void }) { return <section className="sovereign-card overflow-hidden p-3 sm:p-4"><div className="grid grid-cols-7">{weekdays.map((day) => <div key={day} className="py-2 text-center text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--muted)]">{day}</div>)}</div><div className="grid grid-cols-7 gap-1">{days.map((day, index) => { const inMonth = parseISODate(day.date).getMonth() === month; return <motion.button key={day.date} onClick={() => onSelect(day.date)} className={cn("min-h-[64px] rounded-lg border p-1.5 text-left transition sm:min-h-[92px] sm:p-2", inMonth ? "border-white/[0.055] bg-white/[0.018]" : "border-transparent opacity-30", day.isToday && "border-[rgba(139,115,255,.55)]", selectedDate === day.date && "bg-[rgba(139,115,255,.07)] ring-1 ring-[var(--purple)]")} initial={{ opacity: 0 }} animate={{ opacity: inMonth ? 1 : .3 }} transition={{ delay: index * .003 }}><span className={cn("text-[0.62rem] font-semibold sm:text-xs", day.isToday ? "text-[var(--purple-bright)]" : "text-[var(--muted)]")}>{parseISODate(day.date).getDate()}</span><div className="mt-1 space-y-0.5">{day.events.slice(0, 3).map((event) => { const style = eventStyle[event.eventType]; return <div key={event.id} className="truncate rounded px-1 py-0.5 text-[0.48rem] font-medium sm:text-[0.58rem]" style={{ background: style.background, color: style.color, boxShadow: event.ownerId ? `inset 2px 0 ${ownerColor(event.ownerId)}` : undefined }}>{event.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(event.amount))}</div>; })}{day.events.length > 3 && <p className="text-[0.5rem] text-[var(--muted)]">+{day.events.length - 3} more</p>}</div></motion.button>; })}</div></section>; }

function WeekView({ days, selectedDate, onSelect }: { days: CalendarDay[]; selectedDate: string; onSelect: (date: string) => void }) { return <section className="grid gap-2 sm:grid-cols-7">{days.map((day) => <button key={day.date} onClick={() => onSelect(day.date)} className={cn("sovereign-card min-h-40 p-3 text-left", selectedDate === day.date && "border-[rgba(139,115,255,.5)]")}><p className="text-[0.62rem] uppercase tracking-wider text-[var(--muted)]">{parseISODate(day.date).toLocaleDateString("en-US", { weekday: "short" })}</p><p className="mt-1 text-lg font-semibold">{parseISODate(day.date).getDate()}</p><div className="mt-3 space-y-1.5">{day.events.slice(0, 5).map((event) => <p key={event.id} className="truncate text-[0.62rem]" style={{ color: eventStyle[event.eventType].color }}>{event.title}</p>)}</div></button>)}</section>; }

function DayView({ day }: { day: CalendarDay }) { return <section className="sovereign-card p-5 sm:p-6"><div className="mb-5 grid grid-cols-3 gap-3"><div><p className="text-[0.62rem] text-[var(--muted)]">Income</p><p className="mt-1 font-semibold text-[var(--green)]">{formatCurrency(day.totalIncome)}</p></div><div><p className="text-[0.62rem] text-[var(--muted)]">Outflow</p><p className="mt-1 font-semibold text-[var(--amber)]">{formatCurrency(day.totalExpenses)}</p></div><div><p className="text-[0.62rem] text-[var(--muted)]">Net</p><p className={cn("mt-1 font-semibold", day.net >= 0 ? "text-[var(--green)]" : "text-[var(--critical)]")}>{formatCurrency(day.net)}</p></div></div><EventList events={day.events} empty="The timeline is clear today." /></section>; }

function YearView({ year, onSelect }: { year: ReturnType<typeof buildCalendarYear>; onSelect: (month: number) => void }) { return <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{year.months.map((month) => <button key={month.month} onClick={() => onSelect(month.month)} className="sovereign-card p-5 text-left transition hover:-translate-y-0.5"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{month.monthName}</h2><span className={cn("text-xs font-semibold", month.net >= 0 ? "text-[var(--green)]" : "text-[var(--critical)]")}>{formatCurrency(month.net)}</span></div><div className="mt-4 flex justify-between text-[0.65rem] text-[var(--muted)]"><span>{month.billsDue} bills</span><span>{month.days.reduce((sum, day) => sum + day.events.length, 0)} events</span></div></button>)}</section>; }

function EventList({ events, empty }: { events: CalendarEvent[]; empty: string }) { if (!events.length) return <p className="py-6 text-center text-xs text-[var(--muted)]">{empty}</p>; return <div className="space-y-2">{events.map((event) => { const style = eventStyle[event.eventType]; return <div key={event.id} className="flex items-center justify-between gap-4 rounded-xl border-l-2 p-3" style={{ background: style.background, borderLeftColor: ownerColor(event.ownerId) ?? "transparent" }}><div className="min-w-0"><p className="truncate text-xs font-semibold" style={{ color: style.color }}>{event.title}</p><p className="mt-0.5 text-[0.62rem] text-[var(--muted)]">{style.label} · {event.recurrence !== "one_time" ? "Recurring" : event.status}{event.shared ? " · Shared" : ""}</p></div><span className="shrink-0 text-xs font-semibold" style={{ color: style.color }}>{event.amount > 0 ? "+" : "−"}{formatCurrency(Math.abs(event.amount))}</span></div>; })}</div>; }

function SummaryRow({ label, value, color }: { label: string; value: string; color?: string }) { return <div className="flex items-center justify-between"><span className="text-[var(--muted)]">{label}</span><span className="font-semibold" style={{ color }}>{value}</span></div>; }

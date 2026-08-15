import type {
  BillInstance,
  CalendarDay,
  CalendarEvent,
  CalendarMonth,
  CalendarWeek,
  CalendarYear,
  RecurrencePattern,
} from "@/lib/calendar-types";
import { seedDashboard } from "@/lib/mock-data";

export function formatISODate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseISODate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function addMonthsClamped(date: Date, months: number, preferredDay = date.getDate()) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + months);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(preferredDay, lastDay));
  return next;
}

function advanceDate(date: Date, pattern: RecurrencePattern, recurrenceDay?: number) {
  const next = new Date(date);
  if (pattern === "daily") next.setDate(next.getDate() + 1);
  if (pattern === "weekly") next.setDate(next.getDate() + 7);
  if (pattern === "bi_weekly") next.setDate(next.getDate() + 14);
  if (pattern === "semi_monthly") {
    if (next.getDate() < 15) next.setDate(15);
    else {
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
    }
  }
  if (pattern === "monthly") return addMonthsClamped(next, 1, recurrenceDay ?? next.getDate());
  if (pattern === "quarterly") return addMonthsClamped(next, 3, recurrenceDay ?? next.getDate());
  if (pattern === "semi_annually") return addMonthsClamped(next, 6, recurrenceDay ?? next.getDate());
  if (pattern === "annually") {
    const month = next.getMonth();
    const day = next.getDate();
    next.setDate(1);
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(month);
    next.setDate(Math.min(day, new Date(next.getFullYear(), month + 1, 0).getDate()));
  }
  return next;
}

function occurrenceStatus(event: CalendarEvent, date: Date) {
  if (event.status === "missed") return "missed" as const;
  const today = parseISODate(formatISODate(new Date()));
  if (date >= today) return event.status === "pending" ? "pending" as const : "scheduled" as const;
  return event.eventType === "income" ? "posted" as const : "paid" as const;
}

export function expandEvents(events: CalendarEvent[], startDate: Date, endDate: Date) {
  const start = parseISODate(formatISODate(startDate));
  const end = parseISODate(formatISODate(endDate));
  const expanded: CalendarEvent[] = [];

  for (const event of events) {
    let cursor = parseISODate(event.date);
    const eventEnd = event.endDate ? parseISODate(event.endDate) : end;
    if (event.recurrence === "one_time") {
      if (cursor >= start && cursor <= end) expanded.push(event);
      continue;
    }
    let guard = 0;
    while (cursor < start && cursor <= eventEnd && guard < 10_000) {
      cursor = advanceDate(cursor, event.recurrence, event.recurrenceDay);
      guard += 1;
    }
    while (cursor <= end && cursor <= eventEnd && guard < 10_000) {
      const date = formatISODate(cursor);
      expanded.push({ ...event, id: `${event.id}:${date}`, date, status: occurrenceStatus(event, cursor), isOccurrence: true });
      cursor = advanceDate(cursor, event.recurrence, event.recurrenceDay);
      guard += 1;
    }
  }
  return expanded.sort((left, right) => left.date.localeCompare(right.date));
}

export function buildCalendarDay(date: Date, events: CalendarEvent[]): CalendarDay {
  const value = formatISODate(date);
  const dayEvents = events.filter((event) => event.date === value);
  const totalIncome = dayEvents.filter((event) => event.amount > 0).reduce((sum, event) => sum + event.amount, 0);
  const totalExpenses = dayEvents.filter((event) => event.amount < 0).reduce((sum, event) => sum + Math.abs(event.amount), 0);
  const today = formatISODate(new Date());
  return { date: value, events: dayEvents, totalIncome, totalExpenses, net: totalIncome - totalExpenses, isToday: value === today, isPast: value < today, isFuture: value > today };
}

export function buildCalendarMonth(year: number, month: number, events: CalendarEvent[]): CalendarMonth {
  const first = new Date(year, month, 1, 12);
  const last = new Date(year, month + 1, 0, 12);
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const gridEnd = new Date(last);
  gridEnd.setDate(gridEnd.getDate() + 6 - gridEnd.getDay());
  const expanded = expandEvents(events, gridStart, gridEnd);
  const days: CalendarDay[] = [];
  const weeks: CalendarWeek[] = [];
  const cursor = new Date(gridStart);
  let week: CalendarDay[] = [];
  while (cursor <= gridEnd) {
    const day = buildCalendarDay(cursor, expanded);
    days.push(day);
    week.push(day);
    if (week.length === 7) {
      weeks.push({ weekStart: week[0].date, weekEnd: week[6].date, days: week, totalIncome: week.reduce((sum, item) => sum + item.totalIncome, 0), totalExpenses: week.reduce((sum, item) => sum + item.totalExpenses, 0), net: week.reduce((sum, item) => sum + item.net, 0) });
      week = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  const inMonth = days.filter((day) => {
    const date = parseISODate(day.date);
    return date.getFullYear() === year && date.getMonth() === month;
  });
  const totalIncome = inMonth.reduce((sum, day) => sum + day.totalIncome, 0);
  const totalExpenses = inMonth.reduce((sum, day) => sum + day.totalExpenses, 0);
  const bills = inMonth.flatMap((day) => day.events).filter((event) => ["bill", "debt_payment", "subscription", "tax"].includes(event.eventType));
  return {
    year,
    month,
    monthName: first.toLocaleDateString("en-US", { month: "long" }),
    days,
    weeks,
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    billsDue: bills.length,
    billsPaid: bills.filter((event) => event.status === "paid" || event.status === "posted").length,
    billsMissed: bills.filter((event) => event.status === "missed").length,
    billsUpcoming: bills.filter((event) => event.status === "scheduled" || event.status === "pending").length,
  };
}

export function buildCalendarYear(year: number, events: CalendarEvent[]): CalendarYear {
  const months = Array.from({ length: 12 }, (_, month) => buildCalendarMonth(year, month, events));
  const totalIncome = months.reduce((sum, month) => sum + month.totalIncome, 0);
  const totalExpenses = months.reduce((sum, month) => sum + month.totalExpenses, 0);
  return { year, months, totalIncome, totalExpenses, net: totalIncome - totalExpenses };
}

export function getUpcomingBills(events: CalendarEvent[], daysAhead = 30): BillInstance[] {
  const today = parseISODate(formatISODate(new Date()));
  const start = new Date(today);
  start.setDate(start.getDate() - 45);
  const end = new Date(today);
  end.setDate(end.getDate() + daysAhead);
  return expandEvents(events, start, end)
    .filter((event) => ["bill", "debt_payment", "subscription", "tax"].includes(event.eventType))
    .filter((event) => !["paid", "posted"].includes(event.status))
    .map((event) => {
      const daysUntil = Math.round((parseISODate(event.date).getTime() - today.getTime()) / 86_400_000);
      return { eventId: event.id, title: event.title, amount: Math.abs(event.amount), dueDate: event.date, status: event.status, daysUntil, isOverdue: daysUntil < 0, category: event.eventType, isRecurring: event.recurrence !== "one_time" };
    })
    .sort((left, right) => left.daysUntil - right.daysUntil);
}

export function seedCalendarEvents(reference = new Date()): CalendarEvent[] {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const now = reference.toISOString();
  const makeDate = (day: number) => formatISODate(new Date(year, month, day, 12));
  const recurring = (id: string, title: string, amount: number, day: number, eventType: CalendarEvent["eventType"], source: CalendarEvent["source"] = "manual"): CalendarEvent => ({ id, date: makeDate(day), title, amount, eventType, status: "scheduled", recurrence: "monthly", recurrenceDay: day, source, createdAt: now, updatedAt: now });
  const incomes = [recurring("income_salary", "Primary salary", 8788, 15, "income"), recurring("income_yoga", "Yoga income", 888, 1, "income"), recurring("income_hwl", "HWL income", 3000, 1, "income")];
  const debts = seedDashboard.debts.map((debt, index) => ({ ...recurring(`debt_${debt.id}`, debt.name, -debt.minPayment, [1, 1, 5, 10, 15, 15, 20][index] ?? 15, "debt_payment"), debtId: debt.id }));
  const bills = [["Amerigas", 222, 5], ["Electric", 204, 10], ["Water", 60, 10], ["Phone", 240, 1], ["Internet", 65, 1], ["Auto insurance", 255, 5], ["Groceries", 444, 1]] as const;
  const billEvents = bills.map(([name, amount, day]) => recurring(`bill_${name.toLowerCase().replaceAll(" ", "_")}`, name, -amount, day, "bill"));
  const subscriptionEvents = seedDashboard.subscriptions.map((subscription, index) => recurring(`subscription_${subscription.id}`, subscription.name, -subscription.amount, [14, 14, 5, 5, 8, 6, 12, 10, 7, 7, 15, 20, 18][index] ?? 15, "subscription", "detected"));
  return [...incomes, ...debts, ...billEvents, ...subscriptionEvents];
}

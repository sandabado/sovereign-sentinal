export type EventType =
  | "income"
  | "bill"
  | "debt_payment"
  | "subscription"
  | "transfer"
  | "investment"
  | "tax"
  | "custom";

export type RecurrencePattern =
  | "one_time"
  | "daily"
  | "weekly"
  | "bi_weekly"
  | "semi_monthly"
  | "monthly"
  | "quarterly"
  | "semi_annually"
  | "annually";

export type EventStatus = "scheduled" | "pending" | "posted" | "missed" | "paid";

export interface CalendarEvent {
  id: string;
  date: string;
  endDate?: string;
  title: string;
  description?: string;
  amount: number;
  eventType: EventType;
  status: EventStatus;
  recurrence: RecurrencePattern;
  recurrenceDay?: number;
  ownerId?: string;
  householdId?: string;
  shared?: boolean;
  entityId?: string;
  accountId?: string;
  debtId?: string;
  subscriptionId?: string;
  source: "plaid" | "manual" | "csv" | "detected";
  createdAt: string;
  updatedAt: string;
  isOccurrence?: boolean;
}

export interface CalendarDay {
  date: string;
  events: CalendarEvent[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
}

export interface CalendarWeek {
  weekStart: string;
  weekEnd: string;
  days: CalendarDay[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
  monthName: string;
  days: CalendarDay[];
  weeks: CalendarWeek[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
  billsDue: number;
  billsPaid: number;
  billsMissed: number;
  billsUpcoming: number;
}

export interface CalendarYear {
  year: number;
  months: CalendarMonth[];
  totalIncome: number;
  totalExpenses: number;
  net: number;
}

export interface BillInstance {
  eventId: string;
  title: string;
  amount: number;
  dueDate: string;
  status: EventStatus;
  daysUntil: number;
  isOverdue: boolean;
  category: EventType;
  isRecurring: boolean;
}

export type CalendarViewMode = "day" | "week" | "month" | "year";

export type NewCalendarEvent = Pick<
  CalendarEvent,
  "date" | "title" | "description" | "amount" | "eventType" | "status" | "recurrence" | "recurrenceDay"
> & Partial<Pick<CalendarEvent, "ownerId" | "householdId" | "shared" | "entityId" | "accountId" | "debtId" | "subscriptionId">>;

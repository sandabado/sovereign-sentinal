import type { DashboardState } from "./types";

const synced = (hoursAgo: number) =>
  new Date(Date.now() - hoursAgo * 3_600_000).toISOString();

export const seedDashboard: DashboardState = {
  totalAssets: 30417,
  totalDebts: 194348,
  netWorth: -163931,
  monthlyIncome: 12676,
  monthlyExpenses: 8987,
  monthlySurplus: 3689,
  sovereigntyScore: 0,
  accounts: [
    { id: "a1", entityId: "personal", name: "AMEX Primary", type: "credit", institution: "American Express", balance: 2606, apr: 27.9, creditLimit: 12000, minPayment: 96, isActive: true, lastSyncedAt: synced(1) },
    { id: "a2", entityId: "personal", name: "WF CC", type: "credit", institution: "Wells Fargo", balance: 1397, apr: 15.9, creditLimit: 7000, minPayment: 48, isActive: false },
    { id: "a3", entityId: "personal", name: "Sweetwater", type: "credit", institution: "Synchrony", balance: 1414, apr: 29.99, creditLimit: 5000, minPayment: 55, isActive: false },
    { id: "a4", entityId: "personal", name: "PayPal Credit", type: "credit", institution: "PayPal", balance: 2180, apr: 24.24, creditLimit: 6500, minPayment: 74, isActive: false },
    { id: "a5", entityId: "personal", name: "Home Depot", type: "credit", institution: "Citi Retail", balance: 3724, apr: 29.99, creditLimit: 8500, minPayment: 125, isActive: false },
    { id: "a6", entityId: "personal", name: "BofA 4422", type: "credit", institution: "Bank of America", balance: 5938, apr: 21.24, creditLimit: 11000, minPayment: 180, isActive: false },
    { id: "a7", entityId: "household", name: "CapOne CC", type: "credit", institution: "Capital One", balance: 6500, apr: 17.15, creditLimit: 14000, minPayment: 205, isActive: true, lastSyncedAt: synced(2) },
    { id: "a8", entityId: "business", name: "Biz CC", type: "credit", institution: "Chase Business", balance: 2500, apr: 26.49, creditLimit: 10000, minPayment: 85, isActive: true, lastSyncedAt: synced(5) },
    { id: "a9", entityId: "household", name: "Crate & Barrel", type: "credit", institution: "Synchrony", balance: 140, apr: 25.99, creditLimit: 4000, minPayment: 29, isActive: true },
    { id: "a10", entityId: "household", name: "Best Buy", type: "credit", institution: "Citi Retail", balance: 400, apr: 25.99, creditLimit: 3500, minPayment: 30, isActive: true },
    { id: "a11", entityId: "household", name: "BofA 6227", type: "credit", institution: "Bank of America", balance: 3400, apr: 17.24, creditLimit: 9000, minPayment: 104, isActive: true, lastSyncedAt: synced(3) },
    { id: "a12", entityId: "business", name: "BofA 0411", type: "credit", institution: "Bank of America", balance: 7500, apr: 22.24, creditLimit: 15000, minPayment: 228, isActive: true, lastSyncedAt: synced(1) },
    { id: "a13", entityId: "personal", name: "Citi CC", type: "credit", institution: "Citi", balance: 0, apr: 21.74, creditLimit: 6000, minPayment: 0, isActive: true, lastSyncedAt: synced(4) },
  ],
  debts: [
    { id: "d1", name: "CrossCountry Mortgage", balance: 300000, apr: 2.99, minPayment: 1960 },
    { id: "d2", name: "Shellpoint Mortgage", balance: 110000, apr: 12.4, minPayment: 1151 },
    { id: "d3", name: "Aidvantage Student", balance: 58000, apr: 6.25, minPayment: 540 },
    { id: "d4", name: "SOFI Personal", balance: 15582, apr: 13.79, minPayment: 444 },
    { id: "d5", name: "2018 Jeep", balance: 27000, apr: 29.99, minPayment: 470 },
    { id: "d6", name: "2021 Kia", balance: 20000, apr: 24.99, minPayment: 380 },
    { id: "d7", name: "Affirm", balance: 1315, apr: 0, minPayment: 144 },
  ],
  transactions: [
    { id: "t1", date: "2026-08-13", description: "Apple Services", amount: -20.99, category: "Subscriptions", isRecurring: true },
    { id: "t2", date: "2026-08-12", description: "Netflix", amount: -26, category: "Subscriptions", isRecurring: true },
    { id: "t3", date: "2026-08-11", description: "AMEX Payroll", amount: 5850, category: "Income", isRecurring: true },
    { id: "t4", date: "2026-08-10", description: "Whole Foods Market", amount: -145.32, category: "Groceries", isRecurring: false },
    { id: "t5", date: "2026-08-09", description: "Figma", amount: -20, category: "Software", isRecurring: true },
    { id: "t6", date: "2026-08-07", description: "Shell", amount: -52.18, category: "Transportation", isRecurring: false },
    { id: "t7", date: "2026-08-06", description: "Amazon", amount: -88.41, category: "Shopping", isRecurring: false },
  ],
  subscriptions: [
    { id: "s1", name: "Netflix", amount: 26, frequency: "monthly", category: "Streaming", active: true, overlapGroup: "streaming", lastChargedDate: "2026-08-12" },
    { id: "s2", name: "Disney+", amount: 20, frequency: "monthly", category: "Streaming", active: true, overlapGroup: "streaming", lastChargedDate: "2026-08-04" },
    { id: "s3", name: "Peacock", amount: 8, frequency: "monthly", category: "Streaming", active: true, overlapGroup: "streaming", lastChargedDate: "2026-08-03" },
    { id: "s4", name: "Paramount+", amount: 6, frequency: "monthly", category: "Streaming", active: true, overlapGroup: "streaming", lastChargedDate: "2026-08-02" },
    { id: "s5", name: "HBO Max", amount: 17, frequency: "monthly", category: "Streaming", active: true, overlapGroup: "streaming", lastChargedDate: "2026-07-29" },
    { id: "s6", name: "Spotify", amount: 10, frequency: "monthly", category: "Music", active: true, overlapGroup: "music", lastChargedDate: "2026-08-01" },
    { id: "s7", name: "Audible", amount: 15, frequency: "monthly", category: "Audio", active: true, overlapGroup: "music", lastChargedDate: "2026-08-08" },
    { id: "s8", name: "Apple One", amount: 20, frequency: "monthly", category: "Cloud", active: true, lastChargedDate: "2026-08-05" },
    { id: "s9", name: "Figma", amount: 20, frequency: "monthly", category: "Software", active: true, overlapGroup: "design_tools", lastChargedDate: "2026-08-09" },
    { id: "s10", name: "Canva Pro", amount: 20, frequency: "monthly", category: "Software", active: true, overlapGroup: "design_tools", lastChargedDate: "2026-08-07" },
    { id: "s11", name: "Game Pass", amount: 20, frequency: "monthly", category: "Gaming", active: true, lastChargedDate: "2026-08-01" },
    { id: "s12", name: "Medium", amount: 5, frequency: "monthly", category: "Reading", active: true, lastChargedDate: "2026-07-31" },
    { id: "s13", name: "Chani", amount: 12, frequency: "monthly", category: "Wellness", active: true, lastChargedDate: "2026-08-06" },
  ],
};

export const cashFlowData = [
  { month: "Apr", income: 12000, expenses: 9200, surplus: 2800 },
  { month: "May", income: 11800, expenses: 8900, surplus: 2900 },
  { month: "Jun", income: 13500, expenses: 9500, surplus: 4000 },
  { month: "Jul", income: 12200, expenses: 9100, surplus: 3100 },
  { month: "Aug", income: 12676, expenses: 8987, surplus: 3689 },
];

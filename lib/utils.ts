import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, showSign = false): string {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
  if (!showSign) return value < 0 ? `−${formatted}` : formatted;
  return value < 0 ? `−${formatted}` : `+${formatted}`;
}

export function getSyncStatus(lastSyncedAt?: string) {
  if (!lastSyncedAt) return "manual" as const;
  const hours = (Date.now() - new Date(lastSyncedAt).getTime()) / 3_600_000;
  return hours < 24 ? ("fresh" as const) : ("stale" as const);
}

export function dailyInterestBleed(balance: number, apr: number) {
  return (balance * (apr / 100)) / 365;
}

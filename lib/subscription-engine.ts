import type { Subscription, Transaction } from "@/lib/types";

const merchantPatterns: Array<[string, string, string, string]> = [
  ["NETFLIX", "Netflix", "Streaming", "streaming"],
  ["DISNEY", "Disney+", "Streaming", "streaming"],
  ["PARAMOUNT", "Paramount+", "Streaming", "streaming"],
  ["PEACOCK", "Peacock", "Streaming", "streaming"],
  ["HBO MAX", "HBO Max", "Streaming", "streaming"],
  ["HULU", "Hulu", "Streaming", "streaming"],
  ["YOUTUBE PREMIUM", "YouTube Premium", "Streaming", "streaming"],
  ["SPOTIFY", "Spotify", "Music", "music"],
  ["APPLE MUSIC", "Apple Music", "Music", "music"],
  ["AUDIBLE", "Audible", "Audio", "music"],
  ["APPLE ONE", "Apple One", "Cloud", "apple_bundle"],
  ["ICLOUD", "iCloud", "Cloud", "cloud_storage"],
  ["GOOGLE ONE", "Google One", "Cloud", "cloud_storage"],
  ["DROPBOX", "Dropbox", "Cloud", "cloud_storage"],
  ["FIGMA", "Figma", "Software", "design_tools"],
  ["CANVA", "Canva Pro", "Software", "design_tools"],
  ["ADOBE", "Adobe", "Software", "design_tools"],
  ["GAME PASS", "Game Pass", "Gaming", "gaming"],
  ["XBOX GAME", "Xbox Game Pass", "Gaming", "gaming"],
  ["MEDIUM", "Medium", "Reading", "reading"],
  ["CHANI", "Chani", "Wellness", "wellness"],
  ["CALM", "Calm", "Wellness", "wellness"],
  ["HEADSPACE", "Headspace", "Wellness", "wellness"],
  ["DUOLINGO", "Duolingo", "Education", "education"],
  ["MASTERCLASS", "MasterClass", "Education", "education"],
];

function normalize(value: string) {
  return value.toUpperCase().replace(/[#*]/g, " ").replace(/\b\d{3,}\b/g, " ").replace(/[^A-Z0-9+ ]/g, " ").replace(/\s+/g, " ").trim();
}

function merchantInfo(description: string) {
  const normalized = normalize(description);
  const known = merchantPatterns.find(([pattern]) => normalized.includes(pattern));
  if (known) return { key: known[0].toLowerCase().replaceAll(" ", "_"), name: known[1], category: known[2], group: known[3] };
  const key = normalized.split(" ").slice(0, 3).join("_").toLowerCase();
  const name = normalized.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { key, name, category: "Other", group: undefined };
}

export function detectSubscriptions(transactions: Transaction[]): Subscription[] {
  const groups = new Map<string, { info: ReturnType<typeof merchantInfo>; transactions: Transaction[] }>();
  for (const transaction of transactions) {
    if (transaction.amount >= 0 || transaction.pending) continue;
    const info = merchantInfo(transaction.description);
    if (!info.key) continue;
    const current = groups.get(info.key) ?? { info, transactions: [] };
    current.transactions.push(transaction);
    groups.set(info.key, current);
  }

  const subscriptions: Subscription[] = [];
  for (const [key, group] of groups) {
    if (group.transactions.length < 2) continue;
    const ordered = [...group.transactions].sort((a, b) => a.date.localeCompare(b.date));
    const amounts = ordered.map((transaction) => Math.abs(transaction.amount));
    const median = [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)];
    if (!amounts.every((amount) => Math.abs(amount - median) <= Math.max(2, median * 0.12))) continue;
    const intervals = ordered.slice(1).map((transaction, index) => (Date.parse(transaction.date) - Date.parse(ordered[index].date)) / 86_400_000);
    const averageDays = intervals.reduce((sum, days) => sum + days, 0) / intervals.length;
    const frequency = averageDays >= 5 && averageDays <= 9 ? "weekly" : averageDays >= 25 && averageDays <= 38 ? "monthly" : averageDays >= 330 && averageDays <= 395 ? "annual" : null;
    if (!frequency) continue;
    const previousAmount = amounts.length > 1 && Math.abs(amounts.at(-1)! - amounts.at(-2)!) > 0.5 ? amounts.at(-2) : undefined;
    subscriptions.push({
      id: `detected_${key}`,
      detectionKey: key,
      name: group.info.name,
      amount: Math.round(amounts.at(-1)! * 100) / 100,
      previousAmount,
      frequency,
      category: group.info.category === "Other" ? ordered.at(-1)?.category ?? "Other" : group.info.category,
      active: true,
      lastChargedDate: ordered.at(-1)?.date,
      overlapGroup: group.info.group,
    });
  }
  return subscriptions;
}

export interface SubscriptionWithStats extends Subscription {
  monthlyAmount: number;
  annualAmount: number;
  overlapCount: number;
  flaggedForReview: boolean;
  reviewReason?: string;
}

export interface SubscriptionRecommendation {
  key: string;
  subscriptionId: string;
  type: "cancel" | "rotate" | "review" | "price_alert";
  title: string;
  body: string;
  potentialSavings: number;
}

export interface OverlapGroup {
  group: string;
  displayName: string;
  subscriptions: SubscriptionWithStats[];
  totalMonthly: number;
}

export interface SubscriptionAudit {
  subscriptions: SubscriptionWithStats[];
  overlapGroups: OverlapGroup[];
  totalMonthly: number;
  totalAnnual: number;
  wasteScore: number;
  recommendations: SubscriptionRecommendation[];
}

const monthlyValue = (subscription: Subscription) => subscription.frequency === "annual" ? subscription.amount / 12 : subscription.frequency === "weekly" ? subscription.amount * 52 / 12 : subscription.amount;
const groupName = (group: string) => ({ streaming: "Streaming", music: "Music & Audio", cloud_storage: "Cloud Storage", design_tools: "Design Tools", gaming: "Gaming", wellness: "Wellness", reading: "Reading", education: "Education" }[group] ?? group.replaceAll("_", " "));

export function auditSubscriptions(subscriptions: Subscription[]): SubscriptionAudit {
  const active = subscriptions.filter((subscription) => subscription.active);
  const enriched: SubscriptionWithStats[] = active.map((subscription) => {
    const overlapCount = subscription.overlapGroup ? active.filter((item) => item.overlapGroup === subscription.overlapGroup).length : 0;
    const monthlyAmount = monthlyValue(subscription);
    const flaggedForReview = monthlyAmount >= 50 || Boolean(subscription.previousAmount && subscription.amount > subscription.previousAmount);
    return { ...subscription, monthlyAmount, annualAmount: monthlyAmount * 12, overlapCount, flaggedForReview, reviewReason: monthlyAmount >= 50 ? "High monthly cost" : flaggedForReview ? "Price increased" : undefined };
  });
  const grouped = new Map<string, SubscriptionWithStats[]>();
  for (const subscription of enriched) {
    if (!subscription.overlapGroup) continue;
    grouped.set(subscription.overlapGroup, [...(grouped.get(subscription.overlapGroup) ?? []), subscription]);
  }
  const overlapGroups = [...grouped.entries()].filter(([, items]) => items.length > 1).map(([group, items]) => ({ group, displayName: groupName(group), subscriptions: items, totalMonthly: items.reduce((sum, item) => sum + item.monthlyAmount, 0) }));
  const recommendations: SubscriptionRecommendation[] = [];
  for (const group of overlapGroups) {
    const sorted = [...group.subscriptions].sort((a, b) => b.monthlyAmount - a.monthlyAmount);
    const savings = group.subscriptions.length >= 3 ? group.totalMonthly * 0.5 : sorted[0].monthlyAmount;
    recommendations.push({ key: `${group.group}:overlap`, subscriptionId: sorted[0].id, type: group.subscriptions.length >= 3 ? "rotate" : "cancel", title: group.subscriptions.length >= 3 ? `Rotate ${group.displayName} services` : `Review ${sorted[0].name}`, body: `${group.subscriptions.length} services overlap in ${group.displayName.toLowerCase()}. Keep the ones you use and plan the rest for cancellation.`, potentialSavings: savings });
  }
  for (const subscription of enriched.filter((item) => item.previousAmount && item.amount > item.previousAmount)) {
    const increase = subscription.amount - subscription.previousAmount!;
    recommendations.push({ key: `${subscription.id}:price`, subscriptionId: subscription.id, type: "price_alert", title: `${subscription.name} price increased`, body: `The latest charge rose from $${subscription.previousAmount!.toFixed(2)} to $${subscription.amount.toFixed(2)}.`, potentialSavings: increase });
  }
  const totalMonthly = enriched.reduce((sum, subscription) => sum + subscription.monthlyAmount, 0);
  const recoverable = recommendations.filter((item) => item.type !== "price_alert").reduce((sum, item) => sum + item.potentialSavings, 0);
  return { subscriptions: enriched, overlapGroups, totalMonthly, totalAnnual: totalMonthly * 12, wasteScore: Math.min(100, Math.round(recoverable / Math.max(totalMonthly, 1) * 100)), recommendations };
}

export function mergeSubscriptions(primary: Subscription[], detected: Subscription[]) {
  const merged = new Map<string, Subscription>();
  for (const subscription of [...primary, ...detected]) {
    const key = subscription.detectionKey ?? normalize(subscription.name);
    const current = merged.get(key);
    merged.set(key, current ? { ...current, ...subscription, id: current.id } : subscription);
  }
  return [...merged.values()];
}

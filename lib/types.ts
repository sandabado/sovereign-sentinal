export type AccountType =
  | "checking"
  | "savings"
  | "credit"
  | "investment"
  | "loan"
  | "mortgage"
  | "ira"
  | "hysa"
  | "crypto";

export interface Account {
  id: string;
  ownerId?: string;
  householdId?: string;
  entityId: string;
  plaidAccountId?: string;
  name: string;
  type: AccountType;
  institution: string;
  balance: number;
  apr?: number;
  creditLimit?: number;
  minPayment?: number;
  isActive: boolean;
  lastSyncedAt?: string;
}

export interface Debt {
  id: string;
  name: string;
  balance: number;
  apr: number;
  minPayment: number;
}

export interface Transaction {
  id: string;
  ownerId?: string;
  householdId?: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  isRecurring: boolean;
  pending?: boolean;
  shared?: boolean;
}

export type SubscriptionFrequency = "weekly" | "monthly" | "annual";

export interface Subscription {
  id: string;
  ownerId?: string;
  householdId?: string;
  entityId?: string;
  accountId?: string;
  name: string;
  amount: number;
  previousAmount?: number;
  frequency: SubscriptionFrequency;
  category: string;
  active: boolean;
  nextBillingDate?: string;
  lastChargedDate?: string;
  overlapGroup?: string;
  detectionKey?: string;
  cancellationUrl?: string;
  notes?: string;
}

export type SubscriptionDraft = Pick<
  Subscription,
  "name" | "amount" | "frequency" | "category"
> &
  Partial<
    Pick<
      Subscription,
      | "ownerId"
      | "householdId"
      | "entityId"
      | "accountId"
      | "nextBillingDate"
      | "cancellationUrl"
      | "notes"
    >
  >;

export type SubscriptionUpdate = Partial<SubscriptionDraft>;

export interface SubscriptionTransfer {
  entityId: string;
  accountId?: string;
  ownerId?: string;
  notes?: string;
}

export interface DashboardState {
  totalAssets: number;
  totalDebts: number;
  netWorth: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySurplus: number;
  sovereigntyScore: number;
  accounts: Account[];
  debts: Debt[];
  transactions: Transaction[];
  subscriptions: Subscription[];
}

import type { Debt } from "@/lib/types";

export type StrategyKey = "blizzard" | "avalanche" | "snowball";

export interface PayoffStep {
  debtId: string;
  debtName: string;
  apr: number;
  startBalance: number;
  monthlyPayment: number;
  monthsToPayoff: number;
  totalInterestPaid: number;
  phase: "quick_kill" | "avalanche" | "snowball";
  payoffMonth: number;
  startMonth: number;
}

export interface PayoffPlan {
  steps: PayoffStep[];
  totalMonths: number;
  totalInterestPaid: number;
  totalPaid: number;
  debtFreeDate: string;
  strategy: StrategyKey;
}

type WorkingDebt = Debt & {
  current: number;
  interest: number;
  payoffMonth: number;
  firstTargetMonth: number;
  peakPayment: number;
};

function orderedIds(debts: Debt[], strategy: StrategyKey) {
  if (strategy === "snowball") return [...debts].sort((a, b) => a.balance - b.balance).map((debt) => debt.id);
  if (strategy === "avalanche") return [...debts].sort((a, b) => b.apr - a.apr).map((debt) => debt.id);
  const quick = debts.filter((debt) => debt.balance > 0 && debt.balance < 2000).sort((a, b) => a.balance - b.balance);
  const rest = debts.filter((debt) => debt.balance >= 2000).sort((a, b) => b.apr - a.apr);
  return [...quick, ...rest].map((debt) => debt.id);
}

function simulate(debts: Debt[], extraMonthly: number, strategy: StrategyKey, startDate = new Date()): PayoffPlan {
  const order = orderedIds(debts, strategy);
  const working: WorkingDebt[] = debts.filter((debt) => debt.balance > 0).map((debt) => ({
    ...debt,
    current: debt.balance,
    interest: 0,
    payoffMonth: 0,
    firstTargetMonth: 0,
    peakPayment: debt.minPayment,
  }));
  let month = 0;
  const maxMonths = 600;

  while (working.some((debt) => debt.current > 0.005) && month < maxMonths) {
    month += 1;
    const active = working.filter((debt) => debt.current > 0.005);
    for (const debt of active) {
      const charge = debt.current * (debt.apr / 100 / 12);
      debt.current += charge;
      debt.interest += charge;
    }

    let rollover = 0;
    for (const debt of active) {
      const scheduled = Math.min(debt.minPayment, debt.current);
      debt.current -= scheduled;
      rollover += debt.minPayment - scheduled;
      if (debt.current <= 0.005) debt.payoffMonth = month;
    }

    let attack = Math.max(0, extraMonthly) + rollover;
    for (const id of order) {
      const target = working.find((debt) => debt.id === id);
      if (!target || target.current <= 0.005 || attack <= 0) continue;
      if (!target.firstTargetMonth) target.firstTargetMonth = month;
      const payment = Math.min(attack, target.current);
      target.current -= payment;
      target.peakPayment = Math.max(target.peakPayment, target.minPayment + payment);
      attack -= payment;
      if (target.current <= 0.005) target.payoffMonth = month;
    }
  }

  const phaseFor = (debt: WorkingDebt): PayoffStep["phase"] => {
    if (strategy === "blizzard") return debt.balance < 2000 ? "quick_kill" : "avalanche";
    return strategy;
  };
  const steps = [...working]
    .sort((a, b) => a.payoffMonth - b.payoffMonth)
    .map((debt) => ({
      debtId: debt.id,
      debtName: debt.name,
      apr: debt.apr,
      startBalance: debt.balance,
      monthlyPayment: debt.peakPayment,
      monthsToPayoff: debt.payoffMonth,
      totalInterestPaid: debt.interest,
      phase: phaseFor(debt),
      payoffMonth: debt.payoffMonth,
      startMonth: debt.firstTargetMonth || 1,
    }));
  const totalInterestPaid = steps.reduce((sum, step) => sum + step.totalInterestPaid, 0);
  const totalMonths = Math.max(...steps.map((step) => step.payoffMonth), 0);
  const debtFreeDate = new Date(startDate);
  debtFreeDate.setMonth(debtFreeDate.getMonth() + totalMonths);

  return {
    steps,
    totalMonths,
    totalInterestPaid,
    totalPaid: debts.reduce((sum, debt) => sum + debt.balance, 0) + totalInterestPaid,
    debtFreeDate: debtFreeDate.toISOString(),
    strategy,
  };
}

export const blizzardStrategy = (debts: Debt[], extraMonthly: number, startDate?: Date) => simulate(debts, extraMonthly, "blizzard", startDate);
export const avalancheStrategy = (debts: Debt[], extraMonthly: number, startDate?: Date) => simulate(debts, extraMonthly, "avalanche", startDate);
export const snowballStrategy = (debts: Debt[], extraMonthly: number, startDate?: Date) => simulate(debts, extraMonthly, "snowball", startDate);

export function compareStrategies(debts: Debt[], extraMonthly: number) {
  const blizzard = blizzardStrategy(debts, extraMonthly);
  const avalanche = avalancheStrategy(debts, extraMonthly);
  const snowball = snowballStrategy(debts, extraMonthly);
  const best = [blizzard, avalanche, snowball].sort((a, b) => a.totalInterestPaid - b.totalInterestPaid)[0];
  return { blizzard, avalanche, snowball, best };
}

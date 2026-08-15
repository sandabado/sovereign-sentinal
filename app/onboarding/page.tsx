"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Check,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth, type HouseholdMember } from "@/components/auth-provider";
import { ConnectBankButton } from "@/components/connect-bank-button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type StepId = "welcome" | "income" | "debts" | "bank" | "entities" | "done";
type IncomeRecurrence = "weekly" | "bi_weekly" | "semi_monthly" | "monthly";
type DebtType = "mortgage" | "auto" | "student" | "credit_card" | "personal_loan" | "business_loan" | "heloc" | "tax_debt";
type EntityType = "business_llc" | "trust";
type EntityRelationship = "owner" | "beneficiary";

type IncomeDraft = {
  localId: string;
  title: string;
  amount: string;
  nextDate: string;
  recurrence: IncomeRecurrence;
  ownerId: string;
  shared: boolean;
};

type DebtDraft = {
  localId: string;
  name: string;
  type: DebtType;
  balance: string;
  apr: string;
  minPayment: string;
  ownerId: string;
  shared: boolean;
  personalGuarantee: boolean;
};

type EntityPreset = {
  key: "whole-body" | "shannon" | "hakon-trust";
  name: string;
  type: EntityType;
  description: string;
  preferredMemberName: string;
  relationship: EntityRelationship;
  ownershipPercentage: number | null;
};

type EntityDraft = EntityPreset & {
  selected: boolean;
  ownerId: string;
};

type SaveSummary = {
  incomeCount: number;
  debtCount: number;
  entityCount: number;
  bankConnected: boolean;
};

const STEPS: Array<{ id: StepId; label: string; icon: typeof Sparkles }> = [
  { id: "welcome", label: "Welcome", icon: Sparkles },
  { id: "income", label: "Income", icon: CircleDollarSign },
  { id: "debts", label: "Debts", icon: CreditCard },
  { id: "bank", label: "Bank", icon: Landmark },
  { id: "entities", label: "Entities", icon: Building2 },
  { id: "done", label: "Ready", icon: Check },
];

const ENTITY_PRESETS: EntityPreset[] = [
  {
    key: "whole-body",
    name: "Whole Body Mastery LLC",
    type: "business_llc",
    description: "Operating entity for Whole Body Mastery activity.",
    preferredMemberName: "jesse",
    relationship: "owner",
    ownershipPercentage: 100,
  },
  {
    key: "shannon",
    name: "Shannon Mary Dixon LLC",
    type: "business_llc",
    description: "Separate operating entity for Shannon's work.",
    preferredMemberName: "shannon",
    relationship: "owner",
    ownershipPercentage: 100,
  },
  {
    key: "hakon-trust",
    name: "Hakon Youth Trust",
    type: "trust",
    description: "Youth trust record with Hakon mapped as beneficiary.",
    preferredMemberName: "hakon",
    relationship: "beneficiary",
    ownershipPercentage: 0,
  },
];

const DEBT_TYPES: Array<{ value: DebtType; label: string }> = [
  { value: "credit_card", label: "Credit card" },
  { value: "mortgage", label: "Mortgage" },
  { value: "auto", label: "Auto loan" },
  { value: "student", label: "Student loan" },
  { value: "personal_loan", label: "Personal loan" },
  { value: "business_loan", label: "Business loan" },
  { value: "heloc", label: "HELOC" },
  { value: "tax_debt", label: "Tax debt" },
];

const RECURRENCE_OPTIONS: Array<{ value: IncomeRecurrence; label: string }> = [
  { value: "weekly", label: "Every week" },
  { value: "bi_weekly", label: "Every two weeks" },
  { value: "semi_monthly", label: "Twice a month" },
  { value: "monthly", label: "Every month" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const {
    activeHouseholdId,
    configured,
    householdMembers,
    loading,
    profile,
    signOut,
    user,
  } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [incomeRows, setIncomeRows] = useState<IncomeDraft[]>([newIncomeDraft("income-1")]);
  const [debtRows, setDebtRows] = useState<DebtDraft[]>([newDebtDraft("debt-1")]);
  const [entityRows, setEntityRows] = useState<EntityDraft[]>(() => ENTITY_PRESETS.map((preset) => ({ ...preset, selected: true, ownerId: "" })));
  const [bankConnected, setBankConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  const nextIncomeId = useRef(2);
  const nextDebtId = useRef(2);
  const initializedOwners = useRef(false);
  const step = STEPS[stepIndex];

  useEffect(() => {
    if (loading || initializedOwners.current || !user) return;
    initializedOwners.current = true;
    setIncomeRows((rows) => rows.map((row) => ({ ...row, ownerId: row.ownerId || user.id })));
    setDebtRows((rows) => rows.map((row) => ({ ...row, ownerId: row.ownerId || user.id })));
    setEntityRows((rows) => rows.map((row) => ({ ...row, ownerId: findPreferredMemberId(householdMembers, row.preferredMemberName) ?? user.id })));
  }, [householdMembers, loading, user]);

  const currentMember = useMemo(
    () => householdMembers.find((member) => member.id === user?.id) ?? householdMembers[0] ?? null,
    [householdMembers, user?.id],
  );

  if (loading) return <OnboardingStatus title="Preparing your household" detail="Loading the people and permissions connected to this account." busy />;

  if (!configured) {
    return (
      <OnboardingStatus
        title="Connect your existing Supabase project"
        detail="Onboarding needs the same Supabase project as your sign-in. Add the public project URL and anonymous key, restart the local app, then return here. Nothing has been saved yet."
        actionLabel="Return to sign in"
        onAction={() => router.replace("/auth/login?next=%2Fonboarding")}
      />
    );
  }

  if (!user) {
    return (
      <OnboardingStatus
        title="Sign in to begin"
        detail="Your onboarding records must be attached to an authenticated household member."
        actionLabel="Go to sign in"
        onAction={() => router.replace("/auth/login?next=%2Fonboarding")}
      />
    );
  }

  if (!activeHouseholdId || !currentMember) {
    return (
      <OnboardingStatus
        title="Household setup is incomplete"
        detail="We found your account, but not an active household membership. Sign out and sign back in after the household migration has been applied."
        actionLabel="Sign out safely"
        onAction={() => void signOut().then(() => router.replace("/auth/login?next=%2Fonboarding"))}
      />
    );
  }

  const moveTo = (nextIndex: number) => {
    setError("");
    setStepIndex(Math.max(0, Math.min(nextIndex, STEPS.length - 1)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const continueFromIncome = () => {
    const validation = validateIncome(incomeRows, householdMembers);
    if (validation) return setError(validation);
    moveTo(stepIndex + 1);
  };

  const continueFromDebts = () => {
    const validation = validateDebts(debtRows, householdMembers);
    if (validation) return setError(validation);
    moveTo(stepIndex + 1);
  };

  const finish = async () => {
    const incomeValidation = validateIncome(incomeRows, householdMembers);
    const debtValidation = validateDebts(debtRows, householdMembers);
    if (incomeValidation || debtValidation) {
      setError(incomeValidation ?? debtValidation ?? "Review the details before continuing.");
      return;
    }
    const selectedEntities = entityRows.filter((entity) => entity.selected);
    if (selectedEntities.some((entity) => !householdMembers.some((member) => member.id === entity.ownerId))) {
      setError("Choose a current household member for every selected entity.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setError("Supabase is not available. Check the local project keys and try again.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const incomes = incomeRows.filter(hasIncomeValue);
      const debts = debtRows.filter(hasDebtValue);
      await persistIncome(supabase, user.id, activeHouseholdId, incomes);
      await persistDebts(supabase, user.id, activeHouseholdId, debts);
      await persistEntities(supabase, user.id, activeHouseholdId, selectedEntities);

      const { data: updatedProfile, error: profileError } = await supabase
        .from("user_profiles")
        .update({ onboarding_complete: true })
        .eq("id", user.id)
        .select("id")
        .single();
      if (profileError) throw operationError("mark onboarding complete", profileError);
      if (!updatedProfile?.id) throw new Error("Your setup was saved, but the profile confirmation was missing. Retry to finish safely.");

      setSummary({
        incomeCount: incomes.length,
        debtCount: debts.length,
        entityCount: selectedEntities.length,
        bankConnected,
      });
      moveTo(STEPS.findIndex((item) => item.id === "done"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Setup could not be completed. Retry is safe and will not duplicate records.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <div className="pointer-events-none absolute -left-32 top-16 h-96 w-96 rounded-full bg-[rgba(139,115,255,.08)] blur-[110px]" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-[rgba(85,217,154,.045)] blur-[100px]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-[26px] border border-white/[0.08] bg-[rgba(20,17,27,.88)] shadow-2xl backdrop-blur-xl sm:min-h-[calc(100vh-4rem)] lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-white/[0.07] bg-white/[0.018] p-5 lg:border-b-0 lg:border-r lg:p-7">
          <div className="flex items-center justify-between lg:block">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 text-[var(--purple-bright)]" aria-hidden="true" />
              <span className="text-sm font-bold tracking-[0.14em]">SOVEREIGN</span>
            </div>
            <p className="text-[0.66rem] text-[var(--muted)] lg:mt-2">Household foundation</p>
          </div>

          <ol className="mt-5 grid grid-cols-6 gap-1.5 lg:mt-10 lg:block lg:space-y-2" aria-label="Onboarding progress">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const current = index === stepIndex;
              const complete = index < stepIndex;
              return (
                <li key={item.id}>
                  <div className={cn("flex items-center justify-center gap-3 rounded-xl px-2 py-2.5 text-xs transition lg:justify-start lg:px-3", current && "bg-[rgba(139,115,255,.12)] text-white", !current && "text-[var(--muted)]")} aria-current={current ? "step" : undefined}>
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border", complete ? "border-[rgba(85,217,154,.25)] bg-[rgba(85,217,154,.08)] text-[var(--green)]" : current ? "border-[rgba(139,115,255,.35)] bg-[rgba(139,115,255,.14)] text-[var(--purple-bright)]" : "border-white/[0.07] bg-white/[0.02]")}>
                      {complete ? <Check size={13} /> : <Icon size={13} />}
                    </span>
                    <span className="hidden font-medium lg:block">{item.label}</span>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-5 hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 lg:block">
            <div className="flex items-center gap-2.5">
              <MemberAvatar member={currentMember} />
              <div className="min-w-0"><p className="truncate text-xs font-semibold">{profile?.full_name ?? currentMember.full_name}</p><p className="truncate text-[0.62rem] text-[var(--muted)]">{currentMember.membership.role}</p></div>
            </div>
            <p className="mt-3 text-[0.63rem] leading-relaxed text-[var(--muted)]">Every record stays scoped to your authenticated household.</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <div className="h-1 bg-white/[0.04]"><motion.div className="h-full bg-[linear-gradient(90deg,var(--purple),var(--purple-bright))]" animate={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} transition={{ duration: 0.35 }} /></div>
          <div className="flex-1 p-5 sm:p-8 lg:p-10">
            <motion.div key={step.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }} className="mx-auto max-w-3xl">
              {step.id === "welcome" && <WelcomeStep memberName={firstName(profile?.full_name ?? currentMember.full_name)} householdSize={householdMembers.length} onContinue={() => moveTo(1)} />}
              {step.id === "income" && <IncomeStep rows={incomeRows} members={householdMembers} error={error} onRowsChange={(rows) => { setIncomeRows(rows); setError(""); }} onAdd={() => { setIncomeRows((rows) => [...rows, newIncomeDraft(`income-${nextIncomeId.current++}`, user.id)]); setError(""); }} onBack={() => moveTo(stepIndex - 1)} onSkip={() => { setIncomeRows([]); moveTo(stepIndex + 1); }} onContinue={continueFromIncome} />}
              {step.id === "debts" && <DebtsStep rows={debtRows} members={householdMembers} error={error} onRowsChange={(rows) => { setDebtRows(rows); setError(""); }} onAdd={() => { setDebtRows((rows) => [...rows, newDebtDraft(`debt-${nextDebtId.current++}`, user.id)]); setError(""); }} onBack={() => moveTo(stepIndex - 1)} onSkip={() => { setDebtRows([]); moveTo(stepIndex + 1); }} onContinue={continueFromDebts} />}
              {step.id === "bank" && <BankStep connected={bankConnected} onConnected={() => setBankConnected(true)} onBack={() => moveTo(stepIndex - 1)} onContinue={() => moveTo(stepIndex + 1)} />}
              {step.id === "entities" && <EntitiesStep rows={entityRows} members={householdMembers} saving={saving} error={error} onRowsChange={(rows) => { setEntityRows(rows); setError(""); }} onBack={() => moveTo(stepIndex - 1)} onFinish={() => void finish()} />}
              {step.id === "done" && <DoneStep summary={summary} onContinue={() => { router.replace("/"); router.refresh(); }} />}
            </motion.div>
          </div>
        </section>
      </div>
    </main>
  );
}

function WelcomeStep({ memberName, householdSize, onContinue }: { memberName: string; householdSize: number; onContinue: () => void }) {
  return (
    <div className="flex min-h-[520px] flex-col justify-center py-6">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[rgba(139,115,255,.24)] bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]"><Sparkles size={24} /></div>
      <p className="eyebrow mt-7">Your financial command center</p>
      <h1 className="mt-2 max-w-2xl text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Welcome, {memberName}. Let’s map what matters.</h1>
      <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--muted)]">In a few focused steps, we’ll anchor income, debts, connected accounts, and ownership structure for {householdSize === 1 ? "your household" : `all ${householdSize} visible household members`}.</p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[{ icon: WalletCards, title: "One living picture", copy: "Cash flow and obligations on one timeline." }, { icon: Users, title: "Household aware", copy: "Assign every record to the right person." }, { icon: ShieldCheck, title: "Retry safe", copy: "Setup can resume without duplicate records." }].map(({ icon: Icon, title, copy }) => <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><Icon size={17} className="text-[var(--purple-bright)]" /><p className="mt-3 text-xs font-semibold">{title}</p><p className="mt-1.5 text-[0.68rem] leading-relaxed text-[var(--muted)]">{copy}</p></div>)}
      </div>
      <button type="button" onClick={onContinue} className="mt-9 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--purple)] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--purple-bright)] sm:w-auto sm:self-start">Build the foundation <ChevronRight size={16} /></button>
    </div>
  );
}

function IncomeStep({ rows, members, error, onRowsChange, onAdd, onBack, onSkip, onContinue }: { rows: IncomeDraft[]; members: HouseholdMember[]; error: string; onRowsChange: (rows: IncomeDraft[]) => void; onAdd: () => void; onBack: () => void; onSkip: () => void; onContinue: () => void }) {
  const update = (localId: string, patch: Partial<IncomeDraft>) => onRowsChange(rows.map((row) => row.localId === localId ? { ...row, ...patch } : row));
  return (
    <WizardStep eyebrow="Cash flow in" title="Anchor recurring income" description="Add each predictable deposit. Amounts should be the net amount that reaches an account.">
      <div className="space-y-3">
        {rows.map((row, index) => <div key={row.localId} className="rounded-2xl border border-white/[0.07] bg-white/[0.022] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold">Income source {index + 1}</p>{rows.length > 1 && <button type="button" onClick={() => onRowsChange(rows.filter((item) => item.localId !== row.localId))} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[rgba(239,125,120,.08)] hover:text-[var(--critical)]" aria-label={`Remove income source ${index + 1}`}><Trash2 size={14} /></button>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Source name" className="sm:col-span-2"><input value={row.title} onChange={(event) => update(row.localId, { title: event.target.value })} placeholder="e.g. Whole Body Mastery payout" className={inputClass} /></Field>
            <Field label="Amount per deposit"><input type="number" inputMode="decimal" min="0" step="0.01" value={row.amount} onChange={(event) => update(row.localId, { amount: event.target.value })} placeholder="$0.00" className={inputClass} /></Field>
            <Field label="Cadence"><select value={row.recurrence} onChange={(event) => update(row.localId, { recurrence: event.target.value as IncomeRecurrence })} className={inputClass}>{RECURRENCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label="Next deposit"><input type="date" value={row.nextDate} onChange={(event) => update(row.localId, { nextDate: event.target.value })} className={inputClass} /></Field>
            <MemberSelect label="Income belongs to" value={row.ownerId} members={members} onChange={(ownerId) => update(row.localId, { ownerId })} />
          </div>
          <SharedToggle checked={row.shared} onChange={(shared) => update(row.localId, { shared })} />
        </div>)}
      </div>
      <button type="button" onClick={onAdd} className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:border-white/[0.16] hover:text-white"><Plus size={14} /> Add another income source</button>
      <StepFooter error={error} onBack={onBack} onSkip={onSkip} onContinue={onContinue} />
    </WizardStep>
  );
}

function DebtsStep({ rows, members, error, onRowsChange, onAdd, onBack, onSkip, onContinue }: { rows: DebtDraft[]; members: HouseholdMember[]; error: string; onRowsChange: (rows: DebtDraft[]) => void; onAdd: () => void; onBack: () => void; onSkip: () => void; onContinue: () => void }) {
  const update = (localId: string, patch: Partial<DebtDraft>) => onRowsChange(rows.map((row) => row.localId === localId ? { ...row, ...patch } : row));
  return (
    <WizardStep eyebrow="Obligations" title="Map the debts to conduct" description="Enter current balances and terms. You can refine payment strategy from the Debt Conductor later.">
      <div className="space-y-3">
        {rows.map((row, index) => <div key={row.localId} className="rounded-2xl border border-white/[0.07] bg-white/[0.022] p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><p className="text-xs font-semibold">Debt {index + 1}</p>{rows.length > 1 && <button type="button" onClick={() => onRowsChange(rows.filter((item) => item.localId !== row.localId))} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted)] hover:bg-[rgba(239,125,120,.08)] hover:text-[var(--critical)]" aria-label={`Remove debt ${index + 1}`}><Trash2 size={14} /></button>}</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Debt name" className="sm:col-span-2 lg:col-span-2"><input value={row.name} onChange={(event) => update(row.localId, { name: event.target.value })} placeholder="e.g. Chase Sapphire" className={inputClass} /></Field>
            <Field label="Type"><select value={row.type} onChange={(event) => update(row.localId, { type: event.target.value as DebtType })} className={inputClass}>{DEBT_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field label="Current balance"><input type="number" inputMode="decimal" min="0" step="0.01" value={row.balance} onChange={(event) => update(row.localId, { balance: event.target.value })} placeholder="$0.00" className={inputClass} /></Field>
            <Field label="APR"><div className="relative"><input type="number" inputMode="decimal" min="0" max="100" step="0.001" value={row.apr} onChange={(event) => update(row.localId, { apr: event.target.value })} placeholder="0.00" className={`${inputClass} pr-9`} /><span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted)]">%</span></div></Field>
            <Field label="Minimum payment"><input type="number" inputMode="decimal" min="0" step="0.01" value={row.minPayment} onChange={(event) => update(row.localId, { minPayment: event.target.value })} placeholder="$0.00" className={inputClass} /></Field>
            <MemberSelect label="Debt belongs to" value={row.ownerId} members={members} onChange={(ownerId) => update(row.localId, { ownerId })} />
            <label className="flex items-center gap-2.5 self-end rounded-xl border border-white/[0.07] bg-[#100e16] px-3.5 py-3 text-xs text-[var(--muted)]"><input type="checkbox" checked={row.personalGuarantee} onChange={(event) => update(row.localId, { personalGuarantee: event.target.checked })} className="accent-[var(--purple)]" /><span>Personally guaranteed</span></label>
          </div>
          <SharedToggle checked={row.shared} onChange={(shared) => update(row.localId, { shared })} />
        </div>)}
      </div>
      <button type="button" onClick={onAdd} className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.08] px-3.5 py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:border-white/[0.16] hover:text-white"><Plus size={14} /> Add another debt</button>
      <StepFooter error={error} onBack={onBack} onSkip={onSkip} onContinue={onContinue} />
    </WizardStep>
  );
}

function BankStep({ connected, onConnected, onBack, onContinue }: { connected: boolean; onConnected: () => void; onBack: () => void; onContinue: () => void }) {
  return (
    <WizardStep eyebrow="Live account data" title="Connect a financial institution" description="A successful connection lets Sovereign sync accounts and transactions. This step is optional and can be completed from the dashboard later.">
      <div className={cn("rounded-[22px] border p-6 sm:p-8", connected ? "border-[rgba(85,217,154,.24)] bg-[rgba(85,217,154,.055)]" : "border-white/[0.08] bg-white/[0.022]")}>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <div className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-2xl", connected ? "bg-[rgba(85,217,154,.1)] text-[var(--green)]" : "bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]")}>{connected ? <Check size={23} /> : <Landmark size={23} />}</div>
          <div className="flex-1"><h2 className="text-base font-semibold">{connected ? "Bank connection confirmed" : "Secure account connection"}</h2><p className="mt-1.5 max-w-xl text-xs leading-relaxed text-[var(--muted)]">{connected ? "Plaid completed the connection and Sovereign accepted the synced item." : "Choose your institution in Plaid's connection window. Sovereign only marks this complete after Plaid confirms success."}</p></div>
          {!connected && <ConnectBankButton onConnected={onConnected} />}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--purple-bright)]" /><p className="text-[0.69rem] leading-relaxed text-[var(--muted)]">Connection status comes from the live exchange endpoint. Closing Plaid or encountering an error will not create a false “connected” state.</p></div>
      <StepFooter onBack={onBack} onSkip={connected ? undefined : onContinue} skipLabel="Connect later" onContinue={onContinue} continueLabel={connected ? "Continue" : "Continue without bank"} />
    </WizardStep>
  );
}

function EntitiesStep({ rows, members, saving, error, onRowsChange, onBack, onFinish }: { rows: EntityDraft[]; members: HouseholdMember[]; saving: boolean; error: string; onRowsChange: (rows: EntityDraft[]) => void; onBack: () => void; onFinish: () => void }) {
  const update = (key: EntityPreset["key"], patch: Partial<EntityDraft>) => onRowsChange(rows.map((row) => row.key === key ? { ...row, ...patch } : row));
  return (
    <WizardStep eyebrow="Ownership map" title="Select the entities to establish" description="These are record structures inside Sovereign, not legal formation actions. Deselect anything you do not want to track yet.">
      <div className="space-y-3">
        {rows.map((row) => {
          const fallbackUsed = !findPreferredMemberId(members, row.preferredMemberName);
          return <article key={row.key} className={cn("rounded-2xl border p-4 transition sm:p-5", row.selected ? "border-[rgba(139,115,255,.28)] bg-[rgba(139,115,255,.055)]" : "border-white/[0.07] bg-white/[0.015] opacity-65")}>
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => update(row.key, { selected: !row.selected })} className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border", row.selected ? "border-[var(--purple)] bg-[var(--purple)] text-white" : "border-white/[0.16]")} aria-label={`${row.selected ? "Deselect" : "Select"} ${row.name}`} aria-pressed={row.selected}>{row.selected && <Check size={13} />}</button>
              <div className="min-w-0 flex-1"><div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h2 className="text-sm font-semibold">{row.name}</h2><span className="self-start rounded-full bg-white/[0.04] px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-wider text-[var(--muted)]">{row.type === "trust" ? "Trust" : "Business LLC"}</span></div><p className="mt-1.5 text-[0.68rem] leading-relaxed text-[var(--muted)]">{row.description}</p></div>
            </div>
            {row.selected && <div className="ml-9 mt-4"><MemberSelect label={row.relationship === "beneficiary" ? "Beneficiary" : "Owner"} value={row.ownerId} members={members} onChange={(ownerId) => update(row.key, { ownerId })} />{fallbackUsed && <p className="mt-2 text-[0.62rem] leading-relaxed text-[var(--amber)]">No household member named {capitalize(row.preferredMemberName)} was found, so this safely defaults to the signed-in member. Choose another member if needed.</p>}</div>}
          </article>;
        })}
      </div>
      <StepFooter error={error} busy={saving} onBack={onBack} onContinue={onFinish} continueLabel={saving ? "Saving your foundation…" : "Finish setup"} />
    </WizardStep>
  );
}

function DoneStep({ summary, onContinue }: { summary: SaveSummary | null; onContinue: () => void }) {
  const results = [
    { label: "Income sources", value: summary?.incomeCount ?? 0, icon: CircleDollarSign },
    { label: "Debts mapped", value: summary?.debtCount ?? 0, icon: CreditCard },
    { label: "Entities tracked", value: summary?.entityCount ?? 0, icon: Building2 },
    { label: "Bank connected", value: summary?.bankConnected ? "Yes" : "Later", icon: Landmark },
  ];
  return (
    <div className="flex min-h-[520px] flex-col items-center justify-center py-6 text-center">
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="grid h-16 w-16 place-items-center rounded-full border border-[rgba(85,217,154,.25)] bg-[rgba(85,217,154,.1)] text-[var(--green)]"><Check size={28} /></motion.div>
      <p className="eyebrow mt-7">Foundation saved</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Your command center is ready.</h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--muted)]">Sovereign now has the first layer of your household’s financial map. Everything can be refined as the picture evolves.</p>
      <div className="mt-8 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">{results.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><Icon size={16} className="mx-auto text-[var(--purple-bright)]" /><p className="mt-2 text-xl font-semibold">{value}</p><p className="mt-1 text-[0.61rem] text-[var(--muted)]">{label}</p></div>)}</div>
      <button type="button" onClick={onContinue} className="mt-9 flex items-center gap-2 rounded-xl bg-[var(--purple)] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[var(--purple-bright)]">Enter the command center <ChevronRight size={16} /></button>
    </div>
  );
}

function WizardStep({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <div className="py-2"><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{title}</h1><p className="mb-7 mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>{children}</div>;
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={cn("block text-[0.68rem] font-medium text-[var(--muted)]", className)}>{label}<span className="mt-1.5 block">{children}</span></label>;
}

function MemberSelect({ label, value, members, onChange }: { label: string; value: string; members: HouseholdMember[]; onChange: (userId: string) => void }) {
  return <Field label={label}><select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="" disabled>Select a household member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></Field>;
}

function SharedToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.018] p-3 text-[0.67rem] text-[var(--muted)]"><input type="checkbox" aria-label="Visible to the household" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 accent-[var(--purple)]" /><span><span className="block font-semibold text-white">Visible to the household</span><span className="mt-0.5 block">Share this record with members whose household permissions allow it.</span></span></label>;
}

function StepFooter({ error, busy = false, onBack, onSkip, onContinue, skipLabel = "Skip for now", continueLabel = "Continue" }: { error?: string; busy?: boolean; onBack: () => void; onSkip?: () => void; onContinue: () => void; skipLabel?: string; continueLabel?: string }) {
  return <div className="mt-7 border-t border-white/[0.07] pt-5">{error && <p role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-[rgba(239,125,120,.2)] bg-[rgba(239,125,120,.07)] px-3.5 py-3 text-xs leading-relaxed text-[var(--critical)]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p>}<div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center"><button type="button" onClick={onBack} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 py-3 text-xs font-semibold text-[var(--muted)] hover:text-white disabled:opacity-40"><ArrowLeft size={14} /> Back</button>{onSkip && <button type="button" onClick={onSkip} disabled={busy} className="px-3 py-3 text-xs font-medium text-[var(--muted)] hover:text-white disabled:opacity-40">{skipLabel}</button>}<button type="button" onClick={onContinue} disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-[var(--purple)] px-5 py-3 text-xs font-semibold text-white transition hover:bg-[var(--purple-bright)] disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto">{busy && <LoaderCircle size={14} className="animate-spin" />}{continueLabel}{!busy && <ChevronRight size={14} />}</button></div></div>;
}

function OnboardingStatus({ title, detail, busy = false, actionLabel, onAction }: { title: string; detail: string; busy?: boolean; actionLabel?: string; onAction?: () => void }) {
  return <main className="grid min-h-screen place-items-center px-4"><section className="sovereign-card w-full max-w-lg p-7 text-center sm:p-9">{busy ? <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-[var(--purple-bright)]" /> : <AlertTriangle className="mx-auto h-7 w-7 text-[var(--amber)]" />}<h1 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">{title}</h1><p className="mt-3 text-sm leading-6 text-[var(--muted)]">{detail}</p>{actionLabel && onAction && <button type="button" onClick={onAction} className="mt-6 rounded-xl bg-[var(--purple)] px-5 py-3 text-xs font-semibold text-white hover:bg-[var(--purple-bright)]">{actionLabel}</button>}</section></main>;
}

function MemberAvatar({ member }: { member: HouseholdMember }) {
  const initials = member.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold text-white" style={{ backgroundColor: member.avatar_color }}>{initials || "SM"}</span>;
}

const inputClass = "w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none";

function newIncomeDraft(localId: string, ownerId = ""): IncomeDraft {
  return { localId, title: "", amount: "", nextDate: todayISO(), recurrence: "monthly", ownerId, shared: true };
}

function newDebtDraft(localId: string, ownerId = ""): DebtDraft {
  return { localId, name: "", type: "credit_card", balance: "", apr: "", minPayment: "", ownerId, shared: true, personalGuarantee: true };
}

function hasIncomeValue(row: IncomeDraft) {
  return Boolean(row.title.trim() || row.amount.trim());
}

function hasDebtValue(row: DebtDraft) {
  return Boolean(row.name.trim() || row.balance.trim() || row.apr.trim() || row.minPayment.trim());
}

function validateIncome(rows: IncomeDraft[], members: HouseholdMember[]) {
  const populatedRows = rows.filter(hasIncomeValue);
  const identities = new Set<string>();
  for (const row of populatedRows) {
    if (!row.title.trim()) return "Give every income source a name.";
    if (!isPositiveMoney(row.amount)) return `Enter a positive deposit amount for ${row.title.trim()}.`;
    if (!isISODate(row.nextDate)) return `Choose the next deposit date for ${row.title.trim()}.`;
    if (!members.some((member) => member.id === row.ownerId)) return `Choose a household member for ${row.title.trim()}.`;
    const identity = `${row.ownerId}:${normalizeKey(row.title)}`;
    if (identities.has(identity)) return `Use distinct names for ${row.title.trim()} income sources assigned to the same member.`;
    identities.add(identity);
  }
  return "";
}

function validateDebts(rows: DebtDraft[], members: HouseholdMember[]) {
  const populatedRows = rows.filter(hasDebtValue);
  const identities = new Set<string>();
  for (const row of populatedRows) {
    if (!row.name.trim()) return "Give every debt a name.";
    if (!isPositiveMoney(row.balance)) return `Enter a positive current balance for ${row.name.trim()}.`;
    if (!isNonNegativeNumber(row.apr) || Number(row.apr) > 100) return `Enter an APR between 0 and 100 for ${row.name.trim()}.`;
    if (!isNonNegativeNumber(row.minPayment)) return `Enter a valid minimum payment for ${row.name.trim()}.`;
    if (!members.some((member) => member.id === row.ownerId)) return `Choose a household member for ${row.name.trim()}.`;
    const identity = `${row.ownerId}:${normalizeKey(row.name)}`;
    if (identities.has(identity)) return `Use distinct names for ${row.name.trim()} debts assigned to the same member.`;
    identities.add(identity);
  }
  return "";
}

async function persistIncome(supabase: SupabaseClient, userId: string, householdId: string, rows: IncomeDraft[]) {
  for (const row of rows) {
    const canonicalKey = `onboarding:income:v1:${householdId}:${row.ownerId}:${normalizeKey(row.title)}`;
    const { data, error } = await supabase.from("calendar_events").upsert({
      user_id: userId,
      owner_id: row.ownerId,
      household_id: householdId,
      shared: row.shared,
      canonical_key: canonicalKey,
      date: row.nextDate,
      title: row.title.trim(),
      description: "Added during household onboarding",
      amount: roundMoney(Number(row.amount)),
      event_type: "income",
      status: "scheduled",
      recurrence: row.recurrence,
      recurrence_day: Number(row.nextDate.slice(-2)),
      source: "manual",
    }, { onConflict: "user_id,canonical_key" }).select("id").single();
    if (error) throw operationError(`save income source “${row.title.trim()}”`, error);
    if (!data?.id) throw new Error(`Sovereign could not confirm income source “${row.title.trim()}”. Retry is safe.`);
  }
}

async function persistDebts(supabase: SupabaseClient, userId: string, householdId: string, rows: DebtDraft[]) {
  for (const row of rows) {
    const id = await deterministicUuid(`sovereign:onboarding:debt:v1:${householdId}:${row.ownerId}:${normalizeKey(row.name)}`);
    const { data, error } = await supabase.from("debts").upsert({
      id,
      user_id: userId,
      owner_id: row.ownerId,
      household_id: householdId,
      shared: row.shared,
      name: row.name.trim(),
      type: row.type,
      balance: roundMoney(Number(row.balance)),
      original_balance: roundMoney(Number(row.balance)),
      apr: roundRate(Number(row.apr)),
      min_payment: roundMoney(Number(row.minPayment)),
      actual_payment: 0,
      payoff_strategy: "avalanche",
      personal_guarantee: row.personalGuarantee,
    }, { onConflict: "id" }).select("id").single();
    if (error) throw operationError(`save debt “${row.name.trim()}”`, error);
    if (!data?.id) throw new Error(`Sovereign could not confirm debt “${row.name.trim()}”. Retry is safe.`);
  }
}

async function persistEntities(supabase: SupabaseClient, userId: string, householdId: string, rows: EntityDraft[]) {
  for (const row of rows) {
    const { data: existingRows, error: lookupError } = await supabase
      .from("entities")
      .select("id")
      .eq("household_id", householdId)
      .eq("name", row.name)
      .limit(1);
    if (lookupError) throw operationError(`check ${row.name}`, lookupError);

    const entityId = existingRows?.[0]?.id ?? await deterministicUuid(`sovereign:onboarding:entity:v1:${householdId}:${normalizeKey(row.name)}`);
    const entityScope = {
      owner_id: row.ownerId,
      household_id: householdId,
      shared: true,
      name: row.name,
      type: row.type,
    };
    const entityResult = existingRows?.[0]
      ? await supabase.from("entities").update(entityScope).eq("id", entityId).select("id").single()
      : await supabase.from("entities").upsert({ id: entityId, user_id: userId, ...entityScope }, { onConflict: "id" }).select("id").single();
    if (entityResult.error) throw operationError(`save ${row.name}`, entityResult.error);
    if (!entityResult.data?.id) throw new Error(`Sovereign could not confirm ${row.name}. Retry is safe.`);

    const { data: assignment, error: assignmentError } = await supabase.from("entity_assignments").upsert({
      entity_id: entityId,
      user_id: row.ownerId,
      household_id: householdId,
      relationship_type: row.relationship,
      ownership_percentage: row.ownershipPercentage,
    }, { onConflict: "entity_id,user_id" }).select("id").single();
    if (assignmentError) throw operationError(`assign ${row.name}`, assignmentError);
    if (!assignment?.id) throw new Error(`Sovereign could not confirm the household assignment for ${row.name}. Retry is safe.`);
  }
}

function operationError(operation: string, error: { message?: string; code?: string }) {
  const suffix = error.code ? ` (${error.code})` : "";
  return new Error(`Could not ${operation}${suffix}. Your completed steps are safe; fix the connection or permission issue and retry.`);
}

async function deterministicUuid(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = Array.from(digest.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function findPreferredMemberId(members: HouseholdMember[], preferredName: string) {
  const needle = normalizeKey(preferredName);
  return members.find((member) => normalizeKey(member.full_name).split("-").includes(needle) || normalizeKey(member.full_name).includes(needle))?.id;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "record";
}

function isPositiveMoney(value: string) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function isNonNegativeNumber(value: string) {
  return value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;
}

function isISODate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundRate(value: number) {
  return Math.round(value * 10000) / 10000;
}

function todayISO() {
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function firstName(value: string) {
  return value.trim().split(/\s+/)[0] || "there";
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

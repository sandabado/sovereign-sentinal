"use client";

import { ArrowLeft, ArrowRightLeft, Banknote, BriefcaseBusiness, Check, CreditCard, FileText, Plus, ReceiptText, Sparkles, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { EventType, NewCalendarEvent, RecurrencePattern } from "@/lib/calendar-types";
import { formatISODate } from "@/lib/calendar-engine";
import { cn } from "@/lib/utils";

export type AddEventQuickType = "income_once" | "income_recurring" | "bill_recurring" | "expense_once" | "debt_payment" | "transfer" | "custom";

const quickTypes = [
  { id: "income_once", label: "One-time income", detail: "Bonus, gift, refund", icon: Banknote },
  { id: "income_recurring", label: "Recurring income", detail: "Salary, business", icon: BriefcaseBusiness },
  { id: "bill_recurring", label: "Recurring bill", detail: "Utility, rent, insurance", icon: ReceiptText },
  { id: "expense_once", label: "One-time expense", detail: "Repair, medical, gift", icon: FileText },
  { id: "debt_payment", label: "Debt payment", detail: "Loan, card, mortgage", icon: CreditCard },
  { id: "transfer", label: "Transfer", detail: "Move money between accounts", icon: ArrowRightLeft },
  { id: "custom", label: "Custom event", detail: "Tax, investment, anything", icon: Sparkles },
] satisfies Array<{ id: AddEventQuickType; label: string; detail: string; icon: typeof Banknote }>;

const recurrenceOptions: Array<[RecurrencePattern, string]> = [
  ["one_time", "One time"], ["weekly", "Weekly"], ["bi_weekly", "Every two weeks"], ["semi_monthly", "1st and 15th"], ["monthly", "Monthly"], ["quarterly", "Quarterly"], ["semi_annually", "Twice yearly"], ["annually", "Annually"],
];

export function AddEventModal({ open, defaultDate, initialType, onClose, onSubmit }: { open: boolean; defaultDate?: string; initialType?: AddEventQuickType; onClose: () => void; onSubmit: (event: NewCalendarEvent) => Promise<unknown> | unknown }) {
  const { activeHouseholdId, activeUserId, currentViewMode, entities, householdMembers, isAdmin, membership, user } = useAuth();
  const [step, setStep] = useState<"type" | "details" | "saved">(initialType ? "details" : "type");
  const [quickType, setQuickType] = useState<AddEventQuickType | null>(initialType ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
    };
  }, [onClose, open]);

  if (!open) return null;
  const resetAndClose = () => {
    setStep("type");
    setQuickType(null);
    setError("");
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quickType) return;
    const form = new FormData(event.currentTarget);
    const date = String(form.get("date"));
    const rawAmount = Math.abs(Number(form.get("amount")));
    const income = quickType.startsWith("income");
    const oneTime = quickType.endsWith("once") || quickType === "transfer";
    const eventType: EventType = income ? "income" : quickType === "debt_payment" ? "debt_payment" : quickType === "transfer" ? "transfer" : quickType === "custom" ? "custom" : "bill";
    const recurrence = (oneTime ? "one_time" : String(form.get("recurrence"))) as RecurrencePattern;
    const entityId = String(form.get("entity_id") ?? "") || undefined;
    const ownerId = String(form.get("owner_id") ?? "") || user?.id;
    setSaving(true);
    setError("");
    try {
      await onSubmit({
        title: String(form.get("title")),
        description: String(form.get("description") || "") || undefined,
        amount: income ? rawAmount : -rawAmount,
        date,
        eventType,
        status: "scheduled",
        recurrence,
        recurrenceDay: recurrence === "one_time" ? undefined : Number(date.slice(-2)),
        ownerId,
        householdId: activeHouseholdId ?? undefined,
        shared: form.get("shared") === "on",
        entityId,
      });
      setStep("saved");
      window.setTimeout(resetAndClose, 850);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Event could not be saved");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto p-4">
      <button className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-md" onClick={resetAndClose} aria-label="Close event dialog" />
      <section className="relative my-auto w-full max-w-xl rounded-[22px] border border-white/[0.09] bg-[#191620] p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title">
        <header className="flex items-center justify-between"><div><p className="eyebrow">Calendar canonical</p><h2 id="event-dialog-title" className="mt-1 text-xl font-semibold">{step === "type" ? "What belongs on the timeline?" : step === "details" ? "Anchor the details" : "Event secured"}</h2></div><button onClick={resetAndClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] text-[var(--muted)] hover:text-white" aria-label="Close"><X size={16} /></button></header>
        {step === "saved" ? <div className="grid min-h-72 place-items-center text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[rgba(85,217,154,.1)] text-[var(--green)]"><Check size={21} /></div><p className="mt-3 text-sm font-semibold">Added to your timeline</p></div></div> : step === "type" ? (
          <div className="mt-6 grid grid-cols-2 gap-3">{quickTypes.map(({ id, label, detail, icon: Icon }) => <button key={id} onClick={() => { setQuickType(id); setStep("details"); }} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-left transition hover:-translate-y-0.5 hover:border-[rgba(139,115,255,.35)]"><Icon size={18} className="text-[var(--purple-bright)]" /><p className="mt-3 text-xs font-semibold sm:text-sm">{label}</p><p className="mt-1 text-[0.65rem] text-[var(--muted)]">{detail}</p></button>)}</div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs font-medium text-[var(--muted)]">Title<input name="title" required placeholder="e.g. Electric bill" className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="block text-xs font-medium text-[var(--muted)]">Amount<input name="amount" type="number" min="0" step="0.01" required placeholder="$0.00" className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /></label><label className="block text-xs font-medium text-[var(--muted)]">Date<input name="date" type="date" required defaultValue={defaultDate ?? formatISODate(new Date())} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white focus:border-[var(--purple)] focus:outline-none" /></label></div>
            {!quickType?.endsWith("once") && <label className="block text-xs font-medium text-[var(--muted)]">Recurrence<select name="recurrence" defaultValue="monthly" className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white focus:border-[var(--purple)] focus:outline-none">{recurrenceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            {(isAdmin || membership?.permissions.can_edit_finances) && householdMembers.length > 1 && <label className="block text-xs font-medium text-[var(--muted)]">Household member<select name="owner_id" defaultValue={activeUserId ?? user?.id ?? ""} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white focus:border-[var(--purple)] focus:outline-none">{householdMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}</select></label>}
            {entities.length > 0 && <label className="block text-xs font-medium text-[var(--muted)]">Entity association<select name="entity_id" defaultValue={currentViewMode === "business" ? entities[0]?.id : ""} required={currentViewMode === "business"} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white focus:border-[var(--purple)] focus:outline-none"><option value="">Personal / household</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>}
            <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-xs text-[var(--muted)]"><input id="calendar-event-shared" name="shared" type="checkbox" defaultChecked={currentViewMode === "family"} className="mt-0.5 accent-[var(--purple)]" /><div><label htmlFor="calendar-event-shared" className="block font-semibold text-white">Share with household</label><p className="mt-0.5 text-[0.64rem]">Lets restricted family members see this item when policy permits.</p></div></div>
            <label className="block text-xs font-medium text-[var(--muted)]">Notes<textarea name="description" rows={2} placeholder="Optional context" className="mt-1.5 w-full resize-none rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /></label>
            {error && <p role="alert" className="text-xs text-[var(--critical)]">{error}</p>}
            <div className="flex gap-3 pt-1"><button disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--purple)] px-4 py-3 text-xs font-semibold text-white disabled:opacity-50"><Plus size={14} />{saving ? "Saving…" : "Add to calendar"}</button><button type="button" onClick={() => setStep("type")} className={cn("flex items-center gap-1.5 rounded-xl border border-white/[0.08] px-4 py-3 text-xs text-[var(--muted)] hover:text-white")}><ArrowLeft size={14} />Back</button></div>
          </form>
        )}
      </section>
    </div>
  );
}

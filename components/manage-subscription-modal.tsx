"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArrowLeft, Building2, ExternalLink, Plus, Save, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import type {
  Subscription,
  SubscriptionDraft,
  SubscriptionFrequency,
  SubscriptionTransfer,
  SubscriptionUpdate,
} from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type Panel = "add" | "edit" | "archive" | "transfer";

type FormState = {
  name: string;
  amount: string;
  frequency: SubscriptionFrequency;
  category: string;
  nextBillingDate: string;
  ownerId: string;
  householdId: string;
  entityId: string;
  accountId: string;
  cancellationUrl: string;
  notes: string;
};

type TransferState = {
  entityId: string;
  accountId: string;
  ownerId: string;
  notes: string;
};

type ManageSubscriptionModalProps = {
  subscription?: Subscription;
  onClose: () => void;
  onCreate: (input: SubscriptionDraft) => Promise<unknown>;
  onUpdate: (id: string, input: SubscriptionUpdate) => Promise<unknown>;
  onArchive: (id: string, notes?: string) => Promise<unknown>;
  onTransfer: (id: string, transfer: SubscriptionTransfer) => Promise<unknown>;
};

const categories = ["Streaming", "Music", "Cloud", "Software", "Gaming", "Wellness", "Education", "Reading", "Other"];

function initialForm(subscription?: Subscription): FormState {
  return {
    name: subscription?.name ?? "",
    amount: subscription ? String(subscription.amount) : "",
    frequency: subscription?.frequency ?? "monthly",
    category: subscription?.category ?? "",
    nextBillingDate: subscription?.nextBillingDate ?? "",
    ownerId: subscription?.ownerId ?? "",
    householdId: subscription?.householdId ?? "",
    entityId: subscription?.entityId ?? "",
    accountId: subscription?.accountId ?? "",
    cancellationUrl: subscription?.cancellationUrl ?? "",
    notes: subscription?.notes ?? "",
  };
}

function safeExternalUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function toDraft(form: FormState): SubscriptionDraft {
  const amount = Number(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero.");
  const cancellationUrl = safeExternalUrl(form.cancellationUrl);
  if (form.cancellationUrl.trim() && !cancellationUrl) throw new Error("Use a valid http or https provider URL.");
  return {
    name: form.name.trim(),
    amount,
    frequency: form.frequency,
    category: form.category.trim() || "Other",
    nextBillingDate: form.nextBillingDate || undefined,
    ownerId: form.ownerId.trim() || undefined,
    householdId: form.householdId.trim() || undefined,
    entityId: form.entityId.trim() || undefined,
    accountId: form.accountId.trim() || undefined,
    cancellationUrl,
    notes: form.notes.trim() || undefined,
  };
}

const controlClass = "w-full rounded-xl border border-white/[0.09] bg-white/[0.035] px-3 py-2.5 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)]/60 focus:border-[var(--purple)] focus:ring-2 focus:ring-[rgba(139,115,255,.12)]";
const labelClass = "mb-1.5 block text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--muted)]";

export function ManageSubscriptionModal({
  subscription,
  onClose,
  onCreate,
  onUpdate,
  onArchive,
  onTransfer,
}: ManageSubscriptionModalProps) {
  const { activeHouseholdId, activeUserId, currentViewMode, entities, householdMembers, isAdmin, membership, user } = useAuth();
  const canAssignOthers = Boolean(isAdmin || membership?.permissions.can_edit_finances);
  const assignableMembers = canAssignOthers ? householdMembers : householdMembers.filter((member) => member.id === user?.id);
  const [panel, setPanel] = useState<Panel>(subscription ? "edit" : "add");
  const [form, setForm] = useState<FormState>(() => ({
    ...initialForm(subscription),
    ownerId: subscription?.ownerId ?? activeUserId ?? user?.id ?? "",
    householdId: subscription?.householdId ?? activeHouseholdId ?? "",
    entityId: subscription?.entityId ?? (currentViewMode === "business" ? entities[0]?.id ?? "" : ""),
  }));
  const [transfer, setTransfer] = useState<TransferState>({
    entityId: subscription?.entityId ?? "",
    accountId: subscription?.accountId ?? "",
    ownerId: subscription?.ownerId ?? activeUserId ?? user?.id ?? "",
    notes: subscription?.notes ?? "",
  });
  const [archiveNotes, setArchiveNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const providerUrl = safeExternalUrl(subscription?.cancellationUrl);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>("input, select, textarea, button, a[href]");
    firstControl?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose, saving]);

  const setField = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const run = async (operation: () => Promise<unknown>) => {
    setSaving(true);
    setError("");
    try {
      await operation();
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That change could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const submitDetails = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(() => {
      const draft = toDraft(form);
      return subscription ? onUpdate(subscription.id, draft) : onCreate(draft);
    });
  };

  const submitTransfer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!subscription) return;
    void run(() => onTransfer(subscription.id, {
      entityId: transfer.entityId.trim(),
      accountId: transfer.accountId.trim() || undefined,
      ownerId: transfer.ownerId.trim() || undefined,
      notes: transfer.notes.trim() || undefined,
    }));
  };

  const title = panel === "add"
    ? "Add subscription"
    : panel === "archive"
      ? `Archive ${subscription?.name ?? "subscription"}`
      : panel === "transfer"
        ? "Record entity transfer"
        : `Manage ${subscription?.name ?? "subscription"}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0d0a12]/80 p-3 backdrop-blur-sm sm:p-6">
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="subscription-modal-title"
        aria-describedby="subscription-modal-description"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/[0.1] bg-[#211d2a] shadow-2xl"
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#211d2a]/95 px-5 py-4 backdrop-blur sm:px-6">
          <div>
            <p className="eyebrow">Subscription Sentinel</p>
            <h2 id="subscription-modal-title" className="mt-1 text-lg font-semibold">{title}</h2>
            <p id="subscription-modal-description" className="mt-1 text-xs text-[var(--muted)]">
              {panel === "archive" ? "Keep the financial record while removing it from active spend." : panel === "transfer" ? "Record where this expense belongs after you update billing with the provider." : "Keep ownership, billing, and cancellation details together."}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl p-2 text-[var(--muted)] transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40" aria-label="Close subscription dialog">
            <X size={18} />
          </button>
        </header>

        {error && <div role="alert" className="mx-5 mt-5 rounded-xl border border-[rgba(239,125,120,.22)] bg-[rgba(239,125,120,.08)] px-4 py-3 text-xs text-[var(--critical)] sm:mx-6">{error}</div>}

        {(panel === "add" || panel === "edit") && (
          <form onSubmit={submitDetails} className="space-y-5 p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(140px,.7fr)]">
              <label>
                <span className={labelClass}>Service name</span>
                <input required autoComplete="organization" value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Netflix" className={controlClass} />
              </label>
              <label>
                <span className={labelClass}>Charge amount</span>
                <input required min="0.01" step="0.01" inputMode="decimal" type="number" value={form.amount} onChange={(event) => setField("amount", event.target.value)} placeholder="0.00" className={controlClass} />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <label>
                <span className={labelClass}>Frequency</span>
                <select value={form.frequency} onChange={(event) => setField("frequency", event.target.value as SubscriptionFrequency)} className={controlClass}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </label>
              <label>
                <span className={labelClass}>Category</span>
                <input required list="subscription-categories" value={form.category} onChange={(event) => setField("category", event.target.value)} placeholder="Software" className={controlClass} />
                <datalist id="subscription-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
              </label>
              <label>
                <span className={labelClass}>Next billing</span>
                <input type="date" value={form.nextBillingDate} onChange={(event) => setField("nextBillingDate", event.target.value)} className={controlClass} />
              </label>
            </div>

            <label>
              <span className={labelClass}>Provider cancellation page</span>
              <input type="url" inputMode="url" value={form.cancellationUrl} onChange={(event) => setField("cancellationUrl", event.target.value)} placeholder="https://provider.example/account" className={controlClass} />
            </label>

            <details className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--ink)]">Ownership and billing routing</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label><span className={labelClass}>Responsible member</span><select value={form.ownerId} onChange={(event) => setField("ownerId", event.target.value)} className={controlClass}>{assignableMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}{!assignableMembers.length && <option value={user?.id ?? ""}>Signed-in member</option>}</select></label>
                <label><span className={labelClass}>Entity association</span><select value={form.entityId} onChange={(event) => setField("entityId", event.target.value)} className={controlClass}><option value="">Personal / household</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
                <label className="sm:col-span-2"><span className={labelClass}>Billing account record ID</span><input value={form.accountId} onChange={(event) => setField("accountId", event.target.value)} placeholder="Optional; use the linked account UUID" className={controlClass} /></label>
              </div>
              {activeHouseholdId && <p className="mt-3 text-[0.62rem] text-[var(--muted)]">This record stays inside the active household automatically.</p>}
            </details>

            <label>
              <span className={labelClass}>Notes</span>
              <textarea rows={3} value={form.notes} onChange={(event) => setField("notes", event.target.value)} placeholder="Plan, login owner, or renewal terms…" className={`${controlClass} resize-y`} />
            </label>

            {subscription && (
              <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
                <button type="button" onClick={() => { setPanel("transfer"); setError(""); }} className="flex items-center gap-2 rounded-xl border border-[rgba(215,189,120,.22)] bg-[rgba(215,189,120,.07)] px-3.5 py-2.5 text-xs font-semibold text-[var(--gold)] transition hover:bg-[rgba(215,189,120,.12)]"><Building2 size={14} /> Transfer to entity</button>
                <button type="button" onClick={() => { setPanel("archive"); setError(""); }} className="flex items-center gap-2 rounded-xl border border-[rgba(239,125,120,.2)] bg-[rgba(239,125,120,.06)] px-3.5 py-2.5 text-xs font-semibold text-[var(--critical)] transition hover:bg-[rgba(239,125,120,.11)]"><Archive size={14} /> Archive / cancel</button>
                {providerUrl && <a href={providerUrl} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-white">Provider page <ExternalLink size={13} /></a>}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-white/[0.05] hover:text-white disabled:opacity-40">Close</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-[var(--purple)] px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
                {subscription ? <Save size={14} /> : <Plus size={14} />}{saving ? "Saving…" : subscription ? "Save changes" : "Add subscription"}
              </button>
            </div>
          </form>
        )}

        {panel === "archive" && subscription && (
          <div className="space-y-5 p-5 sm:p-6">
            <div className="rounded-2xl border border-[rgba(239,125,120,.2)] bg-[rgba(239,125,120,.06)] p-4">
              <p className="text-sm font-semibold text-[var(--critical)]">This does not cancel {subscription.name} with the provider.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">Archiving marks the {formatCurrency(subscription.amount)} {subscription.frequency} record inactive in Sovereign. Cancel directly with the provider first if service should stop.</p>
              {providerUrl && <a href={providerUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--critical)] underline decoration-current/40 underline-offset-4">Open provider cancellation page <ExternalLink size={13} /></a>}
            </div>
            <label>
              <span className={labelClass}>Archive note (optional)</span>
              <textarea rows={3} value={archiveNotes} onChange={(event) => setArchiveNotes(event.target.value)} placeholder="Cancelled with provider on…" className={`${controlClass} resize-y`} />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPanel("edit"); setError(""); }} disabled={saving} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-white/[0.05] hover:text-white disabled:opacity-40"><ArrowLeft size={14} /> Back</button>
              <button type="button" onClick={() => void run(() => onArchive(subscription.id, archiveNotes))} disabled={saving} className="flex items-center gap-2 rounded-xl bg-[var(--critical)] px-4 py-2.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"><Archive size={14} />{saving ? "Archiving…" : "Archive in Sovereign"}</button>
            </div>
          </div>
        )}

        {panel === "transfer" && subscription && (
          <form onSubmit={submitTransfer} className="space-y-5 p-5 sm:p-6">
            <div className="rounded-2xl border border-[rgba(215,189,120,.18)] bg-[rgba(215,189,120,.06)] p-4 text-xs leading-relaxed text-[var(--muted)]">
              Sovereign records the intended entity and account. It cannot change billing at {subscription.name}; complete that step on the provider site and then save this record.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Entity</span><select required value={transfer.entityId} onChange={(event) => setTransfer((current) => ({ ...current, entityId: event.target.value }))} className={controlClass}><option value="">Select an entity</option>{entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label>
              <label><span className={labelClass}>Entity account ID</span><input value={transfer.accountId} onChange={(event) => setTransfer((current) => ({ ...current, accountId: event.target.value }))} placeholder="New billing account" className={controlClass} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>Responsible member</span><select value={transfer.ownerId} onChange={(event) => setTransfer((current) => ({ ...current, ownerId: event.target.value }))} className={controlClass}>{assignableMembers.map((member) => <option key={member.id} value={member.id}>{member.full_name}</option>)}{!assignableMembers.length && <option value={user?.id ?? ""}>Signed-in member</option>}</select></label>
            </div>
            <label><span className={labelClass}>Transfer note</span><textarea rows={3} value={transfer.notes} onChange={(event) => setTransfer((current) => ({ ...current, notes: event.target.value }))} placeholder="Billing updated with provider on…" className={`${controlClass} resize-y`} /></label>
            <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-5">
              {providerUrl && <a href={providerUrl} target="_blank" rel="noreferrer" className="mr-auto flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-white/[0.05] hover:text-white">Open provider account <ExternalLink size={13} /></a>}
              <button type="button" onClick={() => { setPanel("edit"); setError(""); }} disabled={saving} className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-white/[0.05] hover:text-white disabled:opacity-40"><ArrowLeft size={14} /> Back</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 rounded-xl bg-[var(--gold)] px-4 py-2.5 text-xs font-semibold text-[#21180a] transition hover:brightness-110 disabled:opacity-50"><Building2 size={14} />{saving ? "Saving…" : "Record transfer"}</button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

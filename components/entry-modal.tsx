"use client";

import { Check, Plus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type EntryType = "Transaction" | "Account" | "Debt" | "Income";
const tabs: EntryType[] = ["Transaction", "Account", "Debt", "Income"];

export function EntryModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (message: string) => void }) {
  const [tab, setTab] = useState<EntryType>("Transaction");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      onClose();
      onAdded(`${tab} added to your financial picture`);
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4">
      <button className="absolute inset-0 h-full w-full cursor-default bg-black/70 backdrop-blur-md" onClick={onClose} aria-label="Close modal" />
      <div className="relative my-auto w-full max-w-lg rounded-[22px] border border-white/[0.09] bg-[#191620] p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="entry-title">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">Manual record</p>
            <h2 id="entry-title" className="mt-1 text-xl font-semibold">Add an entry</h2>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] text-[var(--muted)] transition hover:bg-white/[0.08] hover:text-white" aria-label="Close modal"><X size={17} /></button>
        </div>

        <div className="mt-6 grid grid-cols-4 rounded-xl bg-[#100e16] p-1" role="tablist">
          {tabs.map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={cn("rounded-lg px-1 py-2 text-xs font-medium transition", item === tab ? "bg-[#2a2534] text-white shadow" : "text-[var(--muted)] hover:text-white")} role="tab" aria-selected={item === tab}>{item}</button>
          ))}
        </div>

        {saved ? (
          <div className="grid min-h-[290px] place-items-center text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[rgba(85,217,154,.12)] text-[var(--green)]"><Check size={22} /></div>
              <p className="mt-3 text-sm font-medium">Entry secured</p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {tab === "Transaction" && <>
              <Field label="Description" placeholder="e.g. Whole Foods" required />
              <div className="grid grid-cols-2 gap-3"><Field label="Amount" type="number" placeholder="$0.00" required /><Field label="Date" type="date" required /></div>
              <Select label="Category" options={["Groceries", "Transportation", "Subscriptions", "Software", "Shopping", "Other"]} />
            </>}
            {tab === "Account" && <>
              <Field label="Account name" placeholder="e.g. Chase Checking" required />
              <div className="grid grid-cols-2 gap-3"><Select label="Type" options={["Checking", "Savings", "Credit", "Investment"]} /><Field label="Balance" type="number" placeholder="$0.00" required /></div>
              <Field label="Institution" placeholder="e.g. Chase" />
            </>}
            {tab === "Debt" && <>
              <Field label="Debt name" placeholder="e.g. Auto loan" required />
              <div className="grid grid-cols-2 gap-3"><Field label="Balance" type="number" placeholder="$0.00" required /><Field label="APR" type="number" placeholder="0.00%" required /></div>
              <Field label="Minimum payment" type="number" placeholder="$0.00" required />
            </>}
            {tab === "Income" && <>
              <Field label="Source name" placeholder="e.g. Primary salary" required />
              <div className="grid grid-cols-2 gap-3"><Field label="Monthly amount" type="number" placeholder="$0.00" required /><Select label="Type" options={["Salary", "Freelance", "Business", "Passive"]} /></div>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" defaultChecked className="accent-[var(--purple)]" />Recurring monthly</label>
            </>}
            <div className="flex gap-3 pt-2">
              <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--purple)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--purple-bright)]"><Plus size={16} />Add {tab.toLowerCase()}</button>
              <button type="button" onClick={onClose} className="rounded-xl border border-white/[0.08] px-4 py-3 text-sm text-[var(--muted)] transition hover:text-white">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-xs font-medium text-[var(--muted)]">{label}<input {...props} className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /></label>;
}

function Select({ label, options }: { label: string; options: string[] }) {
  return <label className="block text-xs font-medium text-[var(--muted)]">{label}<select defaultValue="" required className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-[#100e16] px-3.5 py-2.5 text-sm text-white focus:border-[var(--purple)] focus:outline-none"><option value="" disabled>Select...</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

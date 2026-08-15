"use client";

import { Check, Cloud, Database, LoaderCircle, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageTransition } from "@/components/motion";

export function SettingsPanel() {
  const router = useRouter();
  const { configured, loading, user, signOut } = useAuth();
  const [status, setStatus] = useState<"idle" | "syncing" | "synced" | "error">("idle");
  const [message, setMessage] = useState("");

  const exit = async () => {
    await signOut();
    router.replace("/auth/login");
    router.refresh();
  };

  const sync = async () => {
    setStatus("syncing");
    try {
      const response = await fetch("/api/plaid/sync", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Sync failed");
      setStatus("synced");
      setMessage("Connected institutions are up to date.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Sync failed");
    }
  };

  return (
    <DashboardShell>
      <PageTransition>
        <header className="mb-7"><p className="eyebrow">Control plane</p><h1 className="mt-1.5 text-3xl font-semibold tracking-[-0.04em]">Settings</h1><p className="mt-1.5 text-sm text-[var(--muted)]">Identity, data connections, and privacy controls.</p></header>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="sovereign-card p-6">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]"><ShieldCheck size={18} /></div><div><h2 className="text-sm font-semibold">Secure identity</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Required before connecting financial data</p></div></div>
            {!configured ? (
              <div className="mt-6 rounded-xl border border-[rgba(241,185,103,.18)] bg-[rgba(241,185,103,.07)] p-4 text-xs leading-relaxed text-[var(--amber)]">Add your Supabase URL and anonymous key to <code>.env.local</code>, then restart the app.</div>
            ) : loading ? (
              <div className="mt-6 flex items-center gap-2 text-xs text-[var(--muted)]"><LoaderCircle size={14} className="animate-spin" />Verifying your session…</div>
            ) : user ? (
              <div className="mt-6"><p className="text-xs text-[var(--muted)]">Signed in as</p><p className="mt-1 text-sm font-semibold">{user.email ?? "Authenticated user"}</p><div className="mt-4 flex items-center gap-2"><span className="flex items-center gap-1.5 rounded-full bg-[rgba(85,217,154,.1)] px-2.5 py-1 text-[0.65rem] font-semibold text-[var(--green)]"><Check size={11} />RLS active</span><button onClick={exit} className="ml-auto flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-white"><LogOut size={13} />Sign out</button></div></div>
            ) : (
              <button onClick={() => router.replace("/auth/login")} className="mt-6 w-full rounded-xl bg-[var(--purple)] px-4 py-2.5 text-xs font-semibold text-white">Return to sign in</button>
            )}
          </section>

          <section className="sovereign-card p-6">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[rgba(85,217,154,.1)] text-[var(--green)]"><Database size={18} /></div><div><h2 className="text-sm font-semibold">Data synchronization</h2><p className="mt-0.5 text-xs text-[var(--muted)]">Plaid → Supabase → Sovereign</p></div></div>
            <div className="mt-6 space-y-3"><div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3"><span className="flex items-center gap-2 text-xs"><Cloud size={14} className="text-[var(--muted)]" />Supabase Realtime</span><span className={`text-[0.65rem] font-semibold ${configured ? "text-[var(--green)]" : "text-[var(--amber)]"}`}>{configured ? "Configured" : "Keys needed"}</span></div><button onClick={sync} disabled={!user || status === "syncing"} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs font-semibold text-[var(--muted)] transition enabled:hover:border-white/[0.16] enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40">{status === "syncing" ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}Sync connected banks now</button></div>
          </section>
        </div>
        {message && <p role={status === "error" ? "alert" : "status"} className={`mt-4 rounded-xl border p-3 text-xs ${status === "error" ? "border-[rgba(239,125,120,.18)] bg-[rgba(239,125,120,.07)] text-[var(--critical)]" : "border-[rgba(85,217,154,.18)] bg-[rgba(85,217,154,.07)] text-[var(--green)]"}`}>{message}</p>}
      </PageTransition>
    </DashboardShell>
  );
}

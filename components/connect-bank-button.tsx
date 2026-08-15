"use client";

import { AlertCircle, Building2, Check, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnExit, type PlaidLinkOnSuccess } from "react-plaid-link";
import { cn } from "@/lib/utils";

type Status = "idle" | "preparing" | "linking" | "syncing" | "connected" | "error";

export function ConnectBankButton({ onConnected, variant = "default" }: { onConnected?: () => void; variant?: "default" | "quick" }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const onSuccess: PlaidLinkOnSuccess = useCallback(async (publicToken, metadata) => {
    setStatus("syncing");
    try {
      const response = await fetch("/api/plaid/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          public_token: publicToken,
          institution_name: metadata.institution?.name,
          institution_id: metadata.institution?.institution_id,
        }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Account sync failed");
      setStatus("connected");
      setMessage("");
      onConnected?.();
      window.setTimeout(() => setStatus("idle"), 3500);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Connection failed");
    }
  }, [onConnected]);

  const onExit: PlaidLinkOnExit = useCallback((error) => {
    setLinkToken(null);
    if (error) {
      setStatus("error");
      setMessage(error.display_message || error.error_message || "Bank connection was interrupted");
    } else {
      setStatus("idle");
    }
  }, []);

  const { open, ready } = usePlaidLink({ token: linkToken, onSuccess, onExit });
  useEffect(() => {
    if (linkToken && ready && status === "linking") open();
  }, [linkToken, open, ready, status]);

  const start = async () => {
    setStatus("preparing");
    setMessage("");
    try {
      const response = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const body = await response.json() as { link_token?: string; error?: string; code?: string };
      if (!response.ok || !body.link_token) {
        const hint = body.code === "PLAID_NOT_CONFIGURED" ? "Add Plaid and Supabase keys to .env.local." : body.error;
        throw new Error(hint ?? "Could not prepare bank connection");
      }
      setLinkToken(body.link_token);
      setStatus("linking");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not start bank connection");
    }
  };

  const busy = status === "preparing" || status === "linking" || status === "syncing";
  const label = status === "preparing" ? "Preparing" : status === "linking" ? "Connecting" : status === "syncing" ? "Syncing" : status === "connected" ? "Connected" : status === "error" ? "Try again" : "Connect Bank";
  const Icon = busy ? LoaderCircle : status === "connected" ? Check : status === "error" ? AlertCircle : Building2;
  return (
    <div className={cn("relative", variant === "quick" && "h-full")}>
      <button onClick={start} disabled={busy || status === "connected"} className={cn(variant === "quick" ? "sovereign-card flex h-full min-h-24 w-full flex-col items-center justify-center gap-2 p-3 text-center text-xs font-semibold transition hover:-translate-y-0.5" : "flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition sm:text-sm", variant !== "quick" && (status === "connected" ? "border-[rgba(85,217,154,.25)] bg-[rgba(85,217,154,.08)] text-[var(--green)]" : status === "error" ? "border-[rgba(239,125,120,.25)] bg-[rgba(239,125,120,.08)] text-[var(--critical)]" : "border-white/[0.08] bg-white/[0.035] hover:border-white/[0.16]"))} aria-describedby={message ? "bank-connection-error" : undefined}>
        <span className={cn(variant === "quick" && "grid h-10 w-10 place-items-center rounded-full bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]", status === "connected" && "text-[var(--green)]", status === "error" && "text-[var(--critical)]")}><Icon size={variant === "quick" ? 18 : 15} className={busy ? "animate-spin" : undefined} /></span>
        {label}
      </button>
      {message && <p id="bank-connection-error" role="alert" className="absolute right-0 top-[calc(100%+.5rem)] z-20 w-64 rounded-xl border border-[rgba(239,125,120,.18)] bg-[#211d2a] p-3 text-[0.68rem] leading-relaxed text-[var(--critical)] shadow-2xl">{message}</p>}
    </div>
  );
}

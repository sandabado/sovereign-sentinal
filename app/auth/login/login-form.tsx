"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, UserRound } from "lucide-react";
import { motion } from "framer-motion";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authCallbackUrl } from "@/lib/auth";
import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "login" | "signup";
type Notice = { kind: "error" | "success"; text: string } | null;
type LoginFormProps = { nextPath: string; initialError: string | null };

const queryMessages: Record<string, string> = {
  auth_failed: "That sign-in link could not be verified. Request a fresh link and try again.",
  missing_code: "That sign-in link is incomplete. Request a fresh link and try again.",
  not_configured: "Connect this app to your existing Supabase project to enable sign-in.",
};

export default function LoginForm({ nextPath, initialError }: LoginFormProps) {
  const router = useRouter();
  const configured = hasSupabaseBrowserConfig();
  const supabase = createClient();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(() => initialError
    ? { kind: "error", text: queryMessages[initialError] ?? "Authentication could not be completed." }
    : null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("onboarding_complete")
        .eq("id", data.user.id)
        .maybeSingle();
      router.replace(profile?.onboarding_complete === false ? "/onboarding" : nextPath);
    });
  }, [nextPath, router, supabase]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) {
      setNotice({ kind: "error", text: queryMessages.not_configured });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: authCallbackUrl(window.location.origin, "/onboarding"),
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace("/onboarding");
          router.refresh();
          return;
        }
        setNotice({ kind: "success", text: "Account created. Check your email to confirm your address." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        const { data: profile } = user
          ? await supabase.from("user_profiles").select("onboarding_complete").eq("id", user.id).maybeSingle()
          : { data: null };
        router.replace(profile?.onboarding_complete === false ? "/onboarding" : nextPath);
        router.refresh();
      }
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Authentication failed." });
    } finally {
      setLoading(false);
    }
  };

  const sendMagicLink = async () => {
    if (!email) {
      setNotice({ kind: "error", text: "Enter your email first." });
      return;
    }
    if (mode === "signup" && !fullName.trim()) {
      setNotice({ kind: "error", text: "Enter your full name before creating an account." });
      return;
    }
    if (!supabase) {
      setNotice({ kind: "error", text: queryMessages.not_configured });
      return;
    }
    setLoading(true);
    setNotice(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: mode === "signup" ? { full_name: fullName.trim() } : undefined,
          emailRedirectTo: authCallbackUrl(window.location.origin, mode === "signup" ? "/onboarding" : nextPath),
          shouldCreateUser: mode === "signup",
        },
      });
      if (error) throw error;
      setNotice({ kind: "success", text: "Magic link sent. Check your email." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "The magic link could not be sent." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[38rem] w-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--purple)] opacity-[0.055] blur-[120px]" />
      <motion.section className="relative w-full max-w-md" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} aria-labelledby="login-title">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2.5"><ShieldCheck className="h-8 w-8 text-[var(--purple-bright)]" aria-hidden="true" /><span className="text-2xl font-bold tracking-[0.12em]">SOVEREIGN</span></div>
          <p className="mt-2 text-sm text-[var(--muted)]">Your financial operating system. Protected. Yours.</p>
        </div>

        <div className="rounded-[22px] border border-white/[0.08] bg-[rgba(24,21,31,.94)] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex rounded-xl bg-[#100e16] p-1" role="tablist" aria-label="Authentication mode">
            {(["login", "signup"] as Mode[]).map((item) => <button key={item} type="button" onClick={() => { setMode(item); setNotice(null); }} className={cn("flex-1 rounded-lg py-2.5 text-xs font-semibold transition", mode === item ? "bg-[var(--purple)] text-white" : "text-[var(--muted)] hover:text-white")} role="tab" aria-selected={mode === item}>{item === "login" ? "Sign in" : "Create account"}</button>)}
          </div>

          <div className="mb-5"><p className="eyebrow">Secure access</p><h1 id="login-title" className="mt-1.5 text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Claim your command center"}</h1></div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && <label className="block text-xs font-medium text-[var(--muted)]">Full name<div className="relative mt-1.5"><UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" /><input type="text" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required autoComplete="name" className="w-full rounded-xl border border-white/[0.08] bg-[#100e16] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /></div></label>}
            <label className="block text-xs font-medium text-[var(--muted)]">Email<div className="relative mt-1.5"><Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@domain.com" required autoComplete="email" className="w-full rounded-xl border border-white/[0.08] bg-[#100e16] py-2.5 pl-10 pr-3 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /></div></label>
            <label className="block text-xs font-medium text-[var(--muted)]">Password<div className="relative mt-1.5"><Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} className="w-full rounded-xl border border-white/[0.08] bg-[#100e16] py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-[#625d69] focus:border-[var(--purple)] focus:outline-none" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-white" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>

            {notice && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} role={notice.kind === "error" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-3 text-xs leading-relaxed", notice.kind === "error" ? "border-[rgba(239,125,120,.2)] bg-[rgba(239,125,120,.07)] text-[var(--critical)]" : "border-[rgba(85,217,154,.2)] bg-[rgba(85,217,154,.07)] text-[var(--green)]")}>{notice.text}</motion.p>}

            <button type="submit" disabled={loading || !configured} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--purple)] py-3 text-sm font-semibold text-white transition hover:bg-[var(--purple-bright)] disabled:cursor-not-allowed disabled:opacity-45">{loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}{!loading && <ArrowRight className="h-4 w-4" aria-hidden="true" />}</button>
          </form>

          <div className="my-4 flex items-center gap-3"><div className="h-px flex-1 bg-white/[0.07]" /><span className="text-[0.65rem] text-[var(--muted)]">or</span><div className="h-px flex-1 bg-white/[0.07]" /></div>
          <button type="button" onClick={sendMagicLink} disabled={loading || !configured} className="w-full rounded-xl border border-white/[0.08] py-3 text-xs font-semibold text-[var(--muted)] transition hover:border-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-45">Send me a magic link</button>
        </div>
        <p className="mt-6 text-center text-[0.68rem] text-[var(--muted)]">Authenticated sessions · row-level access · encrypted bank credentials</p>
      </motion.section>
    </main>
  );
}

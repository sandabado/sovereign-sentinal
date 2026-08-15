import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";

export function ComingSoon({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <DashboardShell><div className="grid min-h-[72vh] place-items-center"><div className="sovereign-card max-w-lg p-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[rgba(139,115,255,.1)] text-[var(--purple-bright)]"><Sparkles size={20} /></div><p className="eyebrow mt-5">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1><p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{description}</p><Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--purple)] px-4 py-2.5 text-xs font-semibold text-white"><ArrowLeft size={14} />Back to overview</Link></div></div></DashboardShell>;
}

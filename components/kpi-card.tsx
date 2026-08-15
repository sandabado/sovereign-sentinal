import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export function KpiCard({
  label,
  value,
  detail,
  trend = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  trend?: "positive" | "negative" | "neutral";
}) {
  const Icon = trend === "positive" ? ArrowUpRight : trend === "negative" ? ArrowDownRight : Minus;
  const color = trend === "positive" ? "var(--green)" : trend === "negative" ? "var(--critical)" : "var(--muted)";

  return (
    <article className="sovereign-card min-w-0 p-5 transition duration-200 hover:-translate-y-0.5 hover:border-white/[0.13]">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 truncate text-[clamp(1.6rem,2.2vw,2.15rem)] font-semibold leading-none tracking-[-0.045em]">{value}</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs" style={{ color }}>
        <Icon size={14} strokeWidth={2} />
        <span>{detail}</span>
      </div>
    </article>
  );
}

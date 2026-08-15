"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cashFlowData } from "@/lib/mock-data";

type TooltipItem = { name?: string; value?: number; color?: string };

function CashTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-[#211d2a] p-3 shadow-2xl">
      <p className="mb-2 text-xs font-semibold text-[var(--ink)]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="mt-1 flex min-w-36 items-center justify-between gap-5 text-xs">
          <span className="flex items-center gap-2 capitalize text-[var(--muted)]">
            <i className="h-1.5 w-1.5 rounded-full" style={{ background: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold">${Number(entry.value).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowChart() {
  return (
    <article className="sovereign-card h-full p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Five-month view</p>
          <h2 className="mt-1.5 text-lg font-semibold">Cash flow rhythm</h2>
        </div>
        <div className="flex gap-4 text-[0.68rem] font-medium text-[var(--muted)]">
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--purple)]" />Income</span>
          <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#544c60]" />Expenses</span>
        </div>
      </div>
      <div className="h-[265px] w-full" aria-label="Cash flow bar chart for the last five months">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={cashFlowData} barGap={4} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,.055)" vertical={false} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#948fa3", fontSize: 11 }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: "#777181", fontSize: 10 }} tickFormatter={(value) => `$${value / 1000}k`} />
            <Tooltip content={<CashTooltip />} cursor={{ fill: "rgba(255,255,255,.025)" }} />
            <Bar dataKey="income" name="income" fill="#8b73ff" radius={[5, 5, 1, 1]} maxBarSize={28} />
            <Bar dataKey="expenses" name="expenses" fill="#544c60" radius={[5, 5, 1, 1]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-4">
        <span className="text-xs text-[var(--muted)]">August retained</span>
        <span className="text-sm font-semibold text-[var(--green)]">$3,689 <span className="font-normal text-[var(--muted)]">· 29.1%</span></span>
      </div>
    </article>
  );
}

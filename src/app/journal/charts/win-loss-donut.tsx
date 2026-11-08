"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { TradeStats } from "@/core/stats";
import { formatNumber } from "@/lib/number";
import { plural } from "@/lib/plural";
import { ChartCard, TooltipBox } from "./shared";

/** Прибыльные / убыточные / в ноль. Подписи с числами рядом — цвет не единственный признак. */
export function WinLossDonut({ stats }: { stats: TradeStats }) {
  const segments = [
    { key: "wins", label: "Прибыльные", value: stats.wins, color: "var(--chart-profit)" },
    { key: "losses", label: "Убыточные", value: stats.losses, color: "var(--chart-loss)" },
    { key: "even", label: "В ноль", value: stats.breakeven, color: "var(--chart-neutral)" },
  ].filter((s) => s.value > 0);
  const pct = (v: number) => (stats.count ? (v / stats.count) * 100 : 0);

  return (
    <ChartCard title="Прибыльные и убыточные" description={`${stats.count} ${plural(stats.count, ["сделка", "сделки", "сделок"])}`}>
      <div className="relative mx-auto h-[200px] max-w-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={segments}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {segments.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                const s = active ? (payload?.[0]?.payload as (typeof segments)[number] | undefined) : undefined;
                if (!s) return null;
                return (
                  <TooltipBox
                    title={s.label}
                    rows={[{ label: "Сделок", value: `${s.value} · ${formatNumber(pct(s.value), 1)}%`, swatch: s.color }]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold">{formatNumber(stats.winRatePct, 1)}%</span>
          <span className="text-xs text-muted-foreground">прибыльных</span>
        </div>
      </div>
      <ul className="mt-3 grid gap-1 text-sm">
        {[
          { label: "Прибыльные", value: stats.wins, color: "var(--chart-profit)" },
          { label: "Убыточные", value: stats.losses, color: "var(--chart-loss)" },
          { label: "В ноль", value: stats.breakeven, color: "var(--chart-neutral)" },
        ].map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular text-muted-foreground">
              {s.value} · {formatNumber(pct(s.value), 1)}%
            </span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { GroupPnl } from "@/core/stats";
import { plural } from "@/lib/plural";
import { axisRub, ChartCard, pnlTextClass, roundedBar, signedRub, TooltipBox } from "./shared";

const MAX_ROWS = 12;
const ROW_HEIGHT = 30;
const HBar = roundedBar("bar");

/** P&L по инструментам: горизонтальные полосы от нуля, хвост списка — в «Остальные». */
export function InstrumentBars({ rows }: { rows: GroupPnl[] }) {
  let data = rows;
  if (rows.length > MAX_ROWS) {
    // Лучшие и худшие видны всегда, середина сворачивается
    const head = rows.slice(0, MAX_ROWS / 2);
    const tail = rows.slice(-(MAX_ROWS / 2 - 1));
    const middle = rows.slice(MAX_ROWS / 2, rows.length - (MAX_ROWS / 2 - 1));
    const other: GroupPnl = {
      key: "__other",
      label: `Остальные (${middle.length})`,
      pnl: Math.round(middle.reduce((s, r) => s + r.pnl, 0) * 100) / 100,
      count: middle.reduce((s, r) => s + r.count, 0),
      wins: middle.reduce((s, r) => s + r.wins, 0),
    };
    data = [...head, other, ...tail];
  }

  return (
    <ChartCard title="P&L по инструментам" description="От самых прибыльных к самым убыточным">
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * ROW_HEIGHT + 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
          <XAxis type="number" tickFormatter={axisRub} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <ReferenceLine x={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const r = active ? (payload?.[0]?.payload as GroupPnl | undefined) : undefined;
              if (!r) return null;
              return (
                <TooltipBox
                  title={r.label}
                  rows={[
                    { label: "P&L", value: signedRub(r.pnl), className: pnlTextClass(r.pnl) },
                    { label: "Сделок", value: `${r.count} ${plural(r.count, ["сделка", "сделки", "сделок"])}, прибыльных ${r.wins}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="pnl" maxBarSize={18} shape={HBar} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

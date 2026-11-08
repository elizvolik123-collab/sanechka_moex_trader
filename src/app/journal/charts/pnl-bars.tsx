"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Segmented } from "@/components/ui/segmented";
import type { PeriodPnl } from "@/core/stats";
import { plural } from "@/lib/plural";
import type { JournalCharts } from "@/server/services/journal";
import { axisRub, ChartCard, pnlTextClass, roundedBar, signedRub, TooltipBox } from "./shared";

type Bucket = "day" | "week" | "month";

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function periodLabel(period: string, bucket: Bucket, long = false): string {
  const [y, m, d] = period.split("-").map(Number);
  if (bucket === "month") return long ? `${MONTHS[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
  const day = `${d} ${MONTHS[m - 1]}`;
  return bucket === "week" ? (long ? `неделя с ${day} ${y}` : `с ${day}`) : long ? `${day} ${y}` : day;
}

const Column = roundedBar("column");

/** P&L по дням / неделям / месяцам: столбцы от нулевой линии, прибыль и убыток — проверенная пара цветов. */
export function PnlBars({ charts }: { charts: JournalCharts }) {
  const [bucket, setBucket] = useState<Bucket>(charts.byDay.length > 45 ? "week" : "day");
  const data: (PeriodPnl & { label: string })[] = (bucket === "day" ? charts.byDay : bucket === "week" ? charts.byWeek : charts.byMonth).map(
    (p) => ({ ...p, label: periodLabel(p.period, bucket) }),
  );

  return (
    <ChartCard
      title="P&L по периодам"
      description="Сумма результатов закрытых сделок"
      action={
        <Segmented
          label="Группировка"
          value={bucket}
          onChange={setBucket}
          options={[
            { value: "day", label: "Дни" },
            { value: "week", label: "Недели" },
            { value: "month", label: "Месяцы" },
          ]}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tickFormatter={axisRub} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickLine={false} axisLine={false} width={56} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.6 }}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!p) return null;
              return (
                <TooltipBox
                  title={periodLabel(p.period, bucket, true)}
                  rows={[
                    { label: "P&L", value: signedRub(p.pnl), className: pnlTextClass(p.pnl) },
                    { label: "Сделок", value: `${p.count} ${plural(p.count, ["сделка", "сделки", "сделок"])}` },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="pnl" maxBarSize={24} shape={Column} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

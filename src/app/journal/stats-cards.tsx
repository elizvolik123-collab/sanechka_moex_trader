import { Card, CardContent } from "@/components/ui/card";
import type { TradeStats } from "@/core/stats";
import { formatDuration } from "@/lib/duration";
import { formatMoney, formatNumber } from "@/lib/number";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";

const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatMoney(Math.abs(v))}`;
const tone = (v: number) => (v > 0 ? "text-profit" : v < 0 ? "text-loss" : undefined);

export function StatsCards({ stats: s, equityStart, equityEnd }: { stats: TradeStats; equityStart: number | null; equityEnd: number | null }) {
  const cards: { label: string; value: string; hint?: string; className?: string }[] = [
    {
      label: "Итог P&L",
      value: signed(s.totalPnl),
      className: tone(s.totalPnl),
      hint: `${formatNumber(s.count, 0)} ${plural(s.count, ["сделка", "сделки", "сделок"])}`,
    },
    {
      label: "Прибыльные / убыточные",
      value: `${formatNumber(s.winRatePct, 1)}% / ${formatNumber(s.lossRatePct, 1)}%`,
      hint: `${s.wins} / ${s.losses}${s.breakeven ? ` · ${s.breakeven} в ноль` : ""}`,
    },
    { label: "Средняя прибыль", value: signed(s.avgWin), className: "text-profit", hint: `лучшая ${signed(s.bestTrade)}` },
    { label: "Средний убыток", value: signed(s.avgLoss), className: "text-loss", hint: `худшая ${signed(s.worstTrade)}` },
    { label: "Profit factor", value: s.profitFactor === null ? "—" : formatNumber(s.profitFactor, 2), hint: "прибыль / убыток" },
    { label: "Матожидание", value: signed(s.expectancy), className: tone(s.expectancy), hint: "средний результат сделки" },
    {
      label: "Макс. просадка",
      value: s.maxDrawdownRub ? `−${formatMoney(s.maxDrawdownRub)}` : formatMoney(0),
      className: s.maxDrawdownRub ? "text-loss" : undefined,
      hint: s.maxDrawdownPct !== null ? `${formatNumber(s.maxDrawdownPct, 2)}% от пика` : "от пика накопленного P&L",
    },
    {
      label: "Состояние счёта",
      value: equityEnd === null ? "—" : formatMoney(equityEnd),
      hint: equityStart === null ? "начальный капитал не задан" : `на начало периода ${formatMoney(equityStart)}`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="gap-1 py-4">
          <CardContent className="grid gap-1 px-4">
            <span className="text-xs text-muted-foreground">{c.label}</span>
            <span className={cn("tabular text-lg font-semibold", c.className)}>{c.value}</span>
            {c.hint && <span className="text-xs text-muted-foreground">{c.hint}</span>}
          </CardContent>
        </Card>
      ))}
      {s.count > 0 && (
        <p className="col-span-full text-xs text-muted-foreground">
          Среднее время удержания: {formatDuration(s.avgHoldingSec)}
        </p>
      )}
    </div>
  );
}

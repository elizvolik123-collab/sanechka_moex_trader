import Decimal from "decimal.js";
import { tz } from "@date-fns/tz";
import { format, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";

/** Статистика дневника сделок. Даты группируются по московскому времени. */

export const MSK = tz("Europe/Moscow");

export type StatTrade = {
  netPnl: number;
  openedAt: Date;
  closedAt: Date;
  holdingSec: number;
};

export type TradeStats = {
  count: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRatePct: number;
  lossRatePct: number;
  totalPnl: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  /** Сумма прибылей / сумма убытков; null, если убыточных сделок нет */
  profitFactor: number | null;
  /** Матожидание: средний результат сделки, ₽ */
  expectancy: number;
  bestTrade: number;
  worstTrade: number;
  avgHoldingSec: number;
  maxDrawdownRub: number;
  /** От пика капитала; null, если капитал неизвестен (нет начального капитала) */
  maxDrawdownPct: number | null;
};

const round = (d: Decimal, dp = 2) => d.toDecimalPlaces(dp).toNumber();

export function computeStats(trades: readonly StatTrade[], startingCapital: number | null = null): TradeStats {
  const zero = new Decimal(0);
  let grossProfit = zero;
  let grossLoss = zero;
  let wins = 0;
  let losses = 0;
  let best = trades.length ? new Decimal(trades[0].netPnl) : zero;
  let worst = best;
  let holding = 0;

  for (const t of trades) {
    const pnl = new Decimal(t.netPnl);
    if (pnl.gt(0)) {
      wins += 1;
      grossProfit = grossProfit.add(pnl);
    } else if (pnl.lt(0)) {
      losses += 1;
      grossLoss = grossLoss.add(pnl.abs());
    }
    if (pnl.gt(best)) best = pnl;
    if (pnl.lt(worst)) worst = pnl;
    holding += t.holdingSec;
  }

  const count = trades.length;
  const total = grossProfit.sub(grossLoss);
  const dd = maxDrawdown(equityCurve(trades, startingCapital ?? 0), startingCapital !== null);

  return {
    count,
    wins,
    losses,
    breakeven: count - wins - losses,
    winRatePct: count ? round(new Decimal(wins).div(count).mul(100)) : 0,
    lossRatePct: count ? round(new Decimal(losses).div(count).mul(100)) : 0,
    totalPnl: round(total),
    grossProfit: round(grossProfit),
    grossLoss: round(grossLoss),
    avgWin: wins ? round(grossProfit.div(wins)) : 0,
    avgLoss: losses ? round(grossLoss.div(losses).neg()) : 0,
    profitFactor: grossLoss.isZero() ? null : round(grossProfit.div(grossLoss)),
    expectancy: count ? round(total.div(count)) : 0,
    bestTrade: round(best),
    worstTrade: round(worst),
    avgHoldingSec: count ? Math.round(holding / count) : 0,
    maxDrawdownRub: dd.amount,
    maxDrawdownPct: dd.pct,
  };
}

export type EquityPoint = { time: Date; equity: number; pnl: number };

/** Кривая капитала: начальная точка + значение после каждой закрытой сделки (по времени закрытия). */
export function equityCurve(trades: readonly StatTrade[], startingCapital: number): EquityPoint[] {
  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  let equity = new Decimal(startingCapital);
  const points: EquityPoint[] = [];
  if (sorted.length) points.push({ time: sorted[0].openedAt, equity: equity.toNumber(), pnl: 0 });
  for (const t of sorted) {
    equity = equity.add(t.netPnl);
    points.push({ time: t.closedAt, equity: round(equity, 4), pnl: t.netPnl });
  }
  return points;
}

/** Максимальная просадка: наибольшее падение капитала от предыдущего пика. */
export function maxDrawdown(curve: readonly EquityPoint[], withPct: boolean): { amount: number; pct: number | null } {
  let peak: Decimal | null = null;
  let maxAmount = new Decimal(0);
  let maxPct = new Decimal(0);
  for (const p of curve) {
    const equity = new Decimal(p.equity);
    if (peak === null || equity.gt(peak)) peak = equity;
    const drop = peak.sub(equity);
    if (drop.gt(maxAmount)) maxAmount = drop;
    if (withPct && peak.gt(0)) {
      const pct = drop.div(peak).mul(100);
      if (pct.gt(maxPct)) maxPct = pct;
    }
  }
  return { amount: round(maxAmount), pct: withPct ? round(maxPct) : null };
}

export type Bucket = "day" | "week" | "month";

/** Ключ периода по Москве: день "2026-10-23", неделя — понедельник недели, месяц "2026-10". */
export function bucketKey(date: Date, bucket: Bucket): string {
  switch (bucket) {
    case "day":
      return format(date, "yyyy-MM-dd", { in: MSK });
    case "week":
      return format(startOfWeek(date, { weekStartsOn: 1, in: MSK }), "yyyy-MM-dd", { in: MSK });
    case "month":
      return format(date, "yyyy-MM", { in: MSK });
  }
}

export type PeriodPnl = { period: string; pnl: number; count: number };

/** P&L закрытых сделок по дням/неделям/месяцам (по дате закрытия), в хронологическом порядке. */
export function pnlByPeriod(trades: readonly StatTrade[], bucket: Bucket): PeriodPnl[] {
  const map = new Map<string, { pnl: Decimal; count: number }>();
  for (const t of trades) {
    const key = bucketKey(t.closedAt, bucket);
    const cur = map.get(key) ?? { pnl: new Decimal(0), count: 0 };
    cur.pnl = cur.pnl.add(t.netPnl);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, v]) => ({ period, pnl: round(v.pnl), count: v.count }));
}

export type GroupPnl = { key: string; label: string; pnl: number; count: number; wins: number };

/** P&L по произвольному ключу (инструмент, счёт…), от лучшего к худшему. */
export function pnlByKey<T extends StatTrade>(trades: readonly T[], keyOf: (t: T) => string, labelOf: (t: T) => string): GroupPnl[] {
  const map = new Map<string, { label: string; pnl: Decimal; count: number; wins: number }>();
  for (const t of trades) {
    const key = keyOf(t);
    const cur = map.get(key) ?? { label: labelOf(t), pnl: new Decimal(0), count: 0, wins: 0 };
    cur.pnl = cur.pnl.add(t.netPnl);
    cur.count += 1;
    if (t.netPnl > 0) cur.wins += 1;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([key, v]) => ({ key, label: v.label, pnl: round(v.pnl), count: v.count, wins: v.wins }))
    .sort((a, b) => b.pnl - a.pnl || a.label.localeCompare(b.label));
}

export type PeriodPreset = "day" | "week" | "month" | "year" | "all" | "custom";

export type DateRange = { from: Date | null; to: Date | null };

/**
 * Границы периода фильтра по Москве. Для custom ожидаются даты "YYYY-MM-DD" (включительно).
 * Возвращает полуинтервал [from, to): to — начало следующего дня.
 */
export function resolvePeriod(preset: PeriodPreset, now: Date, custom?: { from?: string; to?: string }): DateRange {
  // date-fns с часовым поясом возвращает TZDate — приводим к обычному Date
  const plain = (d: Date) => new Date(d.getTime());
  switch (preset) {
    case "day":
      return { from: plain(startOfDay(now, { in: MSK })), to: null };
    case "week":
      return { from: plain(startOfWeek(now, { weekStartsOn: 1, in: MSK })), to: null };
    case "month":
      return { from: plain(startOfMonth(now, { in: MSK })), to: null };
    case "year":
      return { from: plain(startOfYear(now, { in: MSK })), to: null };
    case "all":
      return { from: null, to: null };
    case "custom": {
      const parse = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00+03:00`) : null);
      const toDay = parse(custom?.to);
      // В Москве нет перехода на летнее время — сутки всегда 24 часа
      return { from: parse(custom?.from), to: toDay ? new Date(toDay.getTime() + 86_400_000) : null };
    }
  }
}

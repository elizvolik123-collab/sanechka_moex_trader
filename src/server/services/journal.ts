import Decimal from "decimal.js";
import {
  computeStats,
  equityCurve,
  pnlByKey,
  pnlByPeriod,
  resolvePeriod,
  type GroupPnl,
  type PeriodPnl,
  type PeriodPreset,
  type TradeStats,
} from "@/core/stats";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";

export type JournalFilters = {
  accountId: string | null;
  instrumentId: string | null;
  period: PeriodPreset;
  from?: string;
  to?: string;
};

export const PERIOD_PRESETS: readonly PeriodPreset[] = ["day", "week", "month", "year", "all", "custom"];

export async function listUserAccounts(userId: string) {
  const rows = await db().brokerAccount.findMany({
    // Счета, исключённые пользователем из дневника, не показываются
    where: { connection: { userId }, isEnabled: true },
    select: { id: true, name: true, startingCapital: true, connection: { select: { broker: true, label: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    broker: a.connection.broker,
    connectionLabel: a.connection.label,
    startingCapital: a.startingCapital?.toNumber() ?? null,
  }));
}

export type JournalAccount = Awaited<ReturnType<typeof listUserAccounts>>[number];

/** Инструменты, по которым у пользователя есть сделки (для фильтра). */
export async function listTradedInstruments(userId: string, accountIds: string[]) {
  if (!accountIds.length) return [];
  return db().instrument.findMany({
    where: { trades: { some: { accountId: { in: accountIds } } } },
    select: { id: true, secid: true, shortName: true },
    orderBy: { secid: "asc" },
  });
}

export type JournalTrade = {
  id: string;
  secid: string;
  shortName: string;
  name: string;
  assetClass: string;
  decimals: number;
  logoName: string | null;
  accountName: string;
  direction: "LONG" | "SHORT";
  openedAt: string;
  closedAt: string;
  quantity: number;
  lots: number;
  avgEntry: number;
  avgExit: number;
  fees: number;
  netPnl: number;
  returnPct: number;
  holdingSec: number;
};

export type JournalCharts = {
  /** Кривая капитала; если капитал неизвестен — накопленный P&L от нуля (equityIsPnl) */
  equity: { time: string; value: number; pnl: number }[];
  equityIsPnl: boolean;
  byDay: PeriodPnl[];
  byWeek: PeriodPnl[];
  byMonth: PeriodPnl[];
  byInstrument: GroupPnl[];
};

export type JournalData = {
  stats: TradeStats;
  /** Капитал на начало и конец периода (null — у счёта не задан начальный капитал) */
  equityStart: number | null;
  equityEnd: number | null;
  trades: JournalTrade[];
  charts: JournalCharts;
  /** Границы периода фильтра (ISO), для календаря */
  range: { from: string | null; to: string | null };
};

/**
 * Данные дневника за период. Все запросы ограничены счетами пользователя:
 * чужой accountId из адресной строки просто не найдёт сделок.
 */
export async function getJournal(userId: string, accounts: JournalAccount[], filters: JournalFilters, now = new Date()): Promise<JournalData> {
  const selected = filters.accountId ? accounts.filter((a) => a.id === filters.accountId) : accounts;
  const accountIds = selected.map((a) => a.id);
  const range = resolvePeriod(filters.period, now, { from: filters.from, to: filters.to });

  const base: Prisma.TradeWhereInput = {
    accountId: { in: accountIds },
    account: { connection: { userId } },
    ...(filters.instrumentId ? { instrumentId: filters.instrumentId } : {}),
  };
  const closedAt: Prisma.DateTimeFilter = {};
  if (range.from) closedAt.gte = range.from;
  if (range.to) closedAt.lt = range.to;

  const [rows, before] = await Promise.all([
    db().trade.findMany({
      where: { ...base, closedAt },
      orderBy: { closedAt: "desc" },
      include: {
        instrument: { select: { secid: true, shortName: true, name: true, assetClass: true, decimals: true, logoName: true } },
        account: { select: { name: true } },
      },
    }),
    range.from
      ? db().trade.aggregate({ where: { ...base, closedAt: { lt: range.from } }, _sum: { netPnl: true } })
      : Promise.resolve(null),
  ]);

  // Капитал известен, только если начальный капитал задан у всех выбранных счетов
  const capitals = selected.map((a) => a.startingCapital);
  const startingCapital = capitals.length && capitals.every((c) => c !== null) ? capitals.reduce((s, c) => s! + c!, 0)! : null;
  // Фильтр по инструменту: «капитал» по одному инструменту не имеет смысла — считаем просадку в рублях
  const equityStart =
    startingCapital === null || filters.instrumentId
      ? null
      : new Decimal(startingCapital).add(before?._sum.netPnl ?? 0).toNumber();

  const statTrades = rows.map((t) => ({
    netPnl: t.netPnl.toNumber(),
    openedAt: t.openedAt,
    closedAt: t.closedAt,
    holdingSec: t.holdingSec,
  }));
  const stats = computeStats(statTrades, equityStart);
  const instrumentOf = new Map(rows.map((t) => [t.id, t.instrument.secid]));
  const keyed = rows.map((t, i) => ({ ...statTrades[i], id: t.id }));

  const charts: JournalCharts = {
    equity: equityCurve(statTrades, equityStart ?? 0).map((p) => ({ time: p.time.toISOString(), value: p.equity, pnl: p.pnl })),
    equityIsPnl: equityStart === null,
    byDay: pnlByPeriod(statTrades, "day"),
    byWeek: pnlByPeriod(statTrades, "week"),
    byMonth: pnlByPeriod(statTrades, "month"),
    byInstrument: pnlByKey(keyed, (t) => instrumentOf.get(t.id)!, (t) => instrumentOf.get(t.id)!),
  };

  return {
    stats,
    charts,
    range: { from: range.from?.toISOString() ?? null, to: range.to?.toISOString() ?? null },
    equityStart,
    equityEnd: equityStart === null ? null : new Decimal(equityStart).add(stats.totalPnl).toNumber(),
    trades: rows.map((t) => ({
      id: t.id,
      secid: t.instrument.secid,
      shortName: t.instrument.shortName,
      name: t.instrument.name,
      assetClass: t.instrument.assetClass,
      decimals: t.instrument.decimals,
      logoName: t.instrument.logoName,
      accountName: t.account.name,
      direction: t.direction,
      openedAt: t.openedAt.toISOString(),
      closedAt: t.closedAt.toISOString(),
      quantity: t.quantity.toNumber(),
      lots: t.lots.toNumber(),
      avgEntry: t.avgEntry.toNumber(),
      avgExit: t.avgExit.toNumber(),
      fees: t.fees.toNumber(),
      netPnl: t.netPnl.toNumber(),
      returnPct: t.returnPct.toNumber(),
      holdingSec: t.holdingSec,
    })),
  };
}

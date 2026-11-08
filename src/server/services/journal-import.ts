import { BOARDS } from "@/core/moex-iss";
import type { NormalizedRow, QuantityUnit, RowError } from "@/core/import/mapping";
import { db } from "../db";
import { rebuildTrades } from "./trades-rebuild";

type InstrumentRef = { id: string; secid: string; board: string; isin: string | null; lotSize: number; isTraded: boolean };

const BOARD_ORDER = BOARDS.map((b) => b.board);

/** Подбирает инструмент справочника для строки отчёта: по ISIN, затем по тикеру (с учётом режима торгов). */
function pick(candidates: InstrumentRef[], row: NormalizedRow): InstrumentRef | undefined {
  const byIsin = row.isin ? candidates.filter((c) => c.isin === row.isin) : [];
  const ticker = row.ticker?.toUpperCase();
  const byTicker = ticker ? candidates.filter((c) => c.secid.toUpperCase() === ticker) : [];
  const pool = byIsin.length ? byIsin : byTicker;
  if (row.board) {
    const exact = pool.find((c) => c.board === row.board);
    if (exact) return exact;
  }
  return [...pool].sort(
    (a, b) => Number(b.isTraded) - Number(a.isTraded) || BOARD_ORDER.indexOf(a.board) - BOARD_ORDER.indexOf(b.board),
  )[0];
}

export type ImportSummary = {
  total: number;
  inserted: number;
  duplicates: number;
  errors: RowError[];
  trades: number;
  rebuildFailed: { secid: string; message: string }[];
};

/**
 * Сохраняет исполнения из файла в счёт импорта (без дублей — уникальность по externalId)
 * и пересобирает сделки по затронутым инструментам. Владение счётом проверяет вызывающий код.
 */
export async function importExecutions(params: {
  accountId: string;
  rows: NormalizedRow[];
  quantityUnit: QuantityUnit;
  parseErrors: RowError[];
}): Promise<ImportSummary> {
  const { accountId, rows, quantityUnit } = params;
  const errors: RowError[] = [...params.parseErrors];

  const tickers = [...new Set(rows.map((r) => r.ticker).filter((t): t is string => !!t))];
  const isins = [...new Set(rows.map((r) => r.isin).filter((t): t is string => !!t))];
  const candidates = await db().instrument.findMany({
    where: {
      OR: [
        ...(tickers.length ? [{ secid: { in: tickers, mode: "insensitive" as const } }] : []),
        ...(isins.length ? [{ isin: { in: isins } }] : []),
      ],
    },
    select: { id: true, secid: true, board: true, isin: true, lotSize: true, isTraded: true },
  });

  const data = [];
  for (const row of rows) {
    const instrument = pick(candidates, row);
    if (!instrument) {
      errors.push({ rowNumber: row.rowNumber, message: `инструмент ${row.ticker ?? row.isin} не найден в справочнике MOEX` });
      continue;
    }
    const quantity = quantityUnit === "lots" ? row.quantity * instrument.lotSize : row.quantity;
    data.push({
      accountId,
      instrumentId: instrument.id,
      externalId: row.externalId,
      side: row.side,
      executedAt: row.executedAt,
      price: row.price,
      quantity,
      lots: quantity / instrument.lotSize,
      accruedInterest: row.accruedInterest,
      brokerFee: row.brokerFee,
      exchangeFee: row.exchangeFee,
    });
  }

  const { count: inserted } = data.length
    ? await db().execution.createMany({ data, skipDuplicates: true })
    : { count: 0 };

  const rebuild = await rebuildTrades(accountId, data.map((d) => d.instrumentId));
  const failedSecids = new Map(rebuild.failed.map((f) => [f.secid, f.message]));

  errors.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    total: rows.length + params.parseErrors.length,
    inserted,
    duplicates: data.length - inserted,
    errors,
    trades: rebuild.trades,
    rebuildFailed: [...failedSecids].map(([secid, message]) => ({ secid, message })),
  };
}

/** Сохранённые сопоставления колонок: поле → текст заголовка (не номер), чтобы шаблон переживал перестановку колонок. */
export type PresetMapping = Partial<Record<string, string>>;

export async function listImportPresets(userId: string) {
  const rows = await db().importPreset.findMany({ where: { userId }, orderBy: { name: "asc" } });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    mapping: p.mapping as PresetMapping,
    options: p.options as { quantityUnit?: QuantityUnit },
  }));
}

export type ImportPresetView = Awaited<ReturnType<typeof listImportPresets>>[number];

export async function saveImportPreset(userId: string, name: string, mapping: PresetMapping, quantityUnit: QuantityUnit) {
  const existing = await db().importPreset.findFirst({ where: { userId, name }, select: { id: true } });
  const data = { mapping, options: { quantityUnit } };
  if (existing) await db().importPreset.update({ where: { id: existing.id }, data });
  else await db().importPreset.create({ data: { userId, name, ...data } });
}

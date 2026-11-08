import type { InstrumentSpec } from "@/core/moex-iss";
import { BOARDS } from "@/core/moex-iss";
import { db } from "../db";
import { logger } from "../logger";
import { fetchAllSpecs, fetchQuote, IssError } from "../moex/iss-client";

/** Загружает спецификации всех режимов торгов из ISS и сохраняет в БД (раз в сутки, из воркера). */
export async function syncInstrumentSpecs(): Promise<{ upserted: number; failedBoards: string[] }> {
  const { specs, failedBoards } = await fetchAllSpecs();
  if (specs.length === 0) throw new IssError(`Не удалось загрузить ни одного режима торгов: ${failedBoards.join(", ")}`);

  const CHUNK = 200;
  for (let i = 0; i < specs.length; i += CHUNK) {
    await db().$transaction(specs.slice(i, i + CHUNK).map((s) => upsertSpec(s)));
  }

  // Инструменты, которых больше нет в выдаче успешно загруженных режимов, помечаем неторгуемыми
  const okBoards = BOARDS.map((b) => b.board).filter((b) => !failedBoards.includes(b));
  for (const board of okBoards) {
    const present = specs.filter((s) => s.board === board).map((s) => s.secid);
    await db().instrument.updateMany({
      where: { board, isTraded: true, secid: { notIn: present } },
      data: { isTraded: false },
    });
  }

  logger.info({ upserted: specs.length, failedBoards }, "Спецификации MOEX обновлены");
  return { upserted: specs.length, failedBoards };
}

function upsertSpec(s: InstrumentSpec) {
  const data = {
    assetClass: s.assetClass,
    shortName: s.shortName,
    name: s.name,
    isin: s.isin,
    currency: s.currency,
    lotSize: s.lotSize,
    minStep: s.minStep,
    stepPrice: s.stepPrice,
    faceValue: s.faceValue,
    initialMargin: s.initialMargin,
    expiresAt: s.expiresAt,
    decimals: s.decimals,
    prevPrice: s.prevPrice,
    prevPriceDate: s.prevPriceDate,
    isTraded: true,
  };
  return db().instrument.upsert({
    where: { secid_board: { secid: s.secid, board: s.board } },
    create: { secid: s.secid, board: s.board, ...data },
    update: data,
  });
}

export type InstrumentDto = {
  id: string;
  secid: string;
  board: string;
  assetClass: "SHARE" | "BOND" | "ETF" | "FUTURE" | "CURRENCY" | "OTHER";
  shortName: string;
  name: string;
  currency: string;
  lotSize: number;
  minStep: number;
  stepPrice: number | null;
  faceValue: number | null;
  initialMargin: number | null;
  expiresAt: string | null;
  decimals: number;
  prevPrice: number | null;
  prevPriceDate: string | null;
  specUpdatedAt: string;
  logoName: string | null;
};

const dtoSelect = {
  id: true,
  secid: true,
  board: true,
  assetClass: true,
  shortName: true,
  name: true,
  currency: true,
  lotSize: true,
  minStep: true,
  stepPrice: true,
  faceValue: true,
  initialMargin: true,
  expiresAt: true,
  decimals: true,
  prevPrice: true,
  prevPriceDate: true,
  specUpdatedAt: true,
  logoName: true,
} as const;

type InstrumentRow = Awaited<ReturnType<typeof findRow>>;
const findRow = (id: string) => db().instrument.findUnique({ where: { id }, select: dtoSelect });

function toDto(r: NonNullable<InstrumentRow>): InstrumentDto {
  return {
    ...r,
    minStep: r.minStep.toNumber(),
    stepPrice: r.stepPrice?.toNumber() ?? null,
    faceValue: r.faceValue?.toNumber() ?? null,
    initialMargin: r.initialMargin?.toNumber() ?? null,
    prevPrice: r.prevPrice?.toNumber() ?? null,
    expiresAt: r.expiresAt?.toISOString() ?? null,
    prevPriceDate: r.prevPriceDate?.toISOString() ?? null,
    specUpdatedAt: r.specUpdatedAt.toISOString(),
  };
}

export async function getInstrument(id: string): Promise<InstrumentDto | null> {
  const row = await findRow(id);
  return row ? toDto(row) : null;
}

/** Поиск по тикеру для перехода из новостей: сначала акции, затем остальные режимы. */
export async function findInstrumentByTicker(ticker: string): Promise<InstrumentDto | null> {
  const rows = await db().instrument.findMany({
    where: { secid: { equals: ticker, mode: "insensitive" }, isTraded: true },
    select: dtoSelect,
  });
  const order = BOARDS.map((b) => b.board);
  rows.sort((a, b) => order.indexOf(a.board) - order.indexOf(b.board));
  return rows[0] ? toDto(rows[0]) : null;
}

export type SearchHit = Pick<InstrumentDto, "id" | "secid" | "board" | "assetClass" | "shortName" | "name" | "logoName">;

/**
 * Автодополнение: точный тикер → тикер с префиксом → совпадение в названии (pg_trgm).
 * Истёкшие фьючерсы и снятые с торгов инструменты не показываются.
 */
export async function searchInstruments(query: string, limit = 10): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const prefix = `${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return db().$queryRaw<SearchHit[]>`
    SELECT id, secid, board, "assetClass", "shortName", name, "logoName"
    FROM "Instrument"
    WHERE "isTraded"
      AND ("expiresAt" IS NULL OR "assetClass" <> 'FUTURE' OR "expiresAt" >= CURRENT_DATE)
      AND (secid ILIKE ${like} OR "shortName" ILIKE ${like} OR name ILIKE ${like})
    ORDER BY
      (upper(secid) = upper(${q})) DESC,
      (secid ILIKE ${prefix}) DESC,
      ("shortName" ILIKE ${prefix}) DESC,
      CASE "assetClass" WHEN 'SHARE' THEN 0 WHEN 'FUTURE' THEN 1 WHEN 'ETF' THEN 2 WHEN 'CURRENCY' THEN 3 ELSE 4 END,
      similarity("shortName", ${q}) DESC,
      secid
    LIMIT ${limit}`;
}

export type QuoteDto =
  | { ok: true; last: number; updatedAt: string | null; source: "iss"; fetchedAt: string }
  | { ok: false; error: string };

const quoteCache = new Map<string, { at: number; value: QuoteDto }>();
const QUOTE_TTL_MS = 5_000;

/** Котировка с кэшем на 5 секунд: все пользователи одного инструмента делят один запрос к ISS. */
export async function getQuote(instrument: { board: string; secid: string }): Promise<QuoteDto> {
  const key = `${instrument.board}:${instrument.secid}`;
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.value;

  let value: QuoteDto;
  try {
    const quote = await fetchQuote(instrument.board, instrument.secid);
    value =
      quote?.last != null
        ? { ok: true, last: quote.last, updatedAt: quote.updatedAt, source: "iss", fetchedAt: new Date().toISOString() }
        : { ok: false, error: "Сегодня по инструменту ещё не было сделок" };
  } catch (error) {
    logger.warn({ err: error, key }, "Не удалось получить котировку");
    value = { ok: false, error: error instanceof IssError ? error.message : "Не удалось получить котировку" };
  }
  quoteCache.set(key, { at: Date.now(), value });
  return value;
}

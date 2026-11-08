import { hashString, parseDateTime, parseDecimalCell, parseSide } from "./values";

/** Поля, которые нужно найти в отчёте брокера. Порядок важен: более специфичные — раньше. */
export const IMPORT_FIELDS = [
  { key: "tradeId", label: "Номер сделки", required: false, synonyms: ["номер сделки", "№ сделки", "id сделки", "trade id", "tradeno", "trade no"] },
  { key: "date", label: "Дата (и время) сделки", required: true, synonyms: ["дата и время", "дата/время", "дата заключения", "дата сделки", "дата исполнения", "datetime", "date", "дата"] },
  { key: "time", label: "Время сделки", required: false, synonyms: ["время заключения", "время сделки", "время", "time"] },
  { key: "isin", label: "ISIN", required: false, synonyms: ["isin", "isin код", "код isin"] },
  { key: "ticker", label: "Тикер", required: false, synonyms: ["тикер", "код актива", "код инструмента", "код бумаги", "код цб", "secid", "symbol", "ticker", "инструмент", "ценная бумага"] },
  { key: "board", label: "Режим торгов", required: false, synonyms: ["режим торгов", "board", "boardid"] },
  { key: "side", label: "Направление (покупка/продажа)", required: true, synonyms: ["вид сделки", "направление", "тип сделки", "операция", "покупка/продажа", "buy/sell", "side"] },
  { key: "quantity", label: "Количество", required: true, synonyms: ["количество", "кол-во", "кол во", "объем, шт", "qty", "quantity", "лотов"] },
  { key: "price", label: "Цена", required: true, synonyms: ["цена за единицу", "цена сделки", "цена", "price"] },
  { key: "exchangeFee", label: "Комиссия биржи", required: false, synonyms: ["комиссия биржи", "комиссия тс", "биржевая комиссия", "exchange fee"] },
  { key: "brokerFee", label: "Комиссия брокера", required: false, synonyms: ["комиссия брокера", "комиссия", "commission", "fee"] },
  { key: "accruedInterest", label: "НКД", required: false, synonyms: ["нкд", "накопленный купонный доход", "accrued interest", "accrued int"] },
] as const;

export type FieldKey = (typeof IMPORT_FIELDS)[number]["key"];
/** Поле → индекс колонки в таблице. */
export type ColumnMapping = Partial<Record<FieldKey, number>>;
export type QuantityUnit = "pieces" | "lots";
export type ImportOptions = { quantityUnit: QuantityUnit };

export type RawTable = { headers: string[]; rows: string[][]; headerRowIndex: number };

const normHeader = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[":]/g, "")
    .trim();

/** Автоопределение колонок по заголовкам: сначала точное совпадение, затем вхождение синонима. */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const normalized = headers.map(normHeader);
  const used = new Set<number>();
  const mapping: ColumnMapping = {};

  for (const pass of ["exact", "includes"] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field.key] !== undefined) continue;
      for (const syn of field.synonyms) {
        const idx = normalized.findIndex((h, i) => !used.has(i) && h !== "" && (pass === "exact" ? h === syn : h.includes(syn)));
        if (idx >= 0) {
          mapping[field.key] = idx;
          used.add(idx);
          break;
        }
      }
    }
  }
  return mapping;
}

/** Ищет строку заголовков среди первых 30 строк: ту, где узнаётся больше всего полей. */
export function detectTable(allRows: readonly string[][]): RawTable {
  const rows = allRows.map((r) => r.map((c) => (c ?? "").toString().trim()));
  let best = { index: -1, score: 0 };
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const score = Object.keys(guessMapping(rows[i])).length;
    if (score > best.score) best = { index: i, score };
  }
  const headerRowIndex = best.score >= 3 ? best.index : rows.findIndex((r) => r.some((c) => c !== ""));
  if (headerRowIndex < 0) return { headers: [], rows: [], headerRowIndex: -1 };
  // Пустые строки не удаляем: индекс строки должен соответствовать номеру строки в файле
  return { headers: rows[headerRowIndex], rows: rows.slice(headerRowIndex + 1), headerRowIndex };
}

export function mappingErrors(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  for (const f of IMPORT_FIELDS) {
    if (f.required && mapping[f.key] === undefined) errors.push(`Не выбрана колонка «${f.label}»`);
  }
  if (mapping.ticker === undefined && mapping.isin === undefined) errors.push("Нужна колонка «Тикер» или «ISIN»");
  return errors;
}

export type NormalizedRow = {
  /** Номер строки в исходном файле (с 1), для сообщений об ошибках */
  rowNumber: number;
  externalId: string;
  executedAt: Date;
  ticker: string | null;
  isin: string | null;
  board: string | null;
  side: "BUY" | "SELL";
  /** В единицах, выбранных в ImportOptions.quantityUnit */
  quantity: number;
  price: number;
  brokerFee: number;
  exchangeFee: number;
  accruedInterest: number | null;
};

export type RowError = { rowNumber: number; message: string };

/**
 * Строки таблицы → нормализованные исполнения. Пустые строки и строки «Итого» без даты и направления
 * пропускаются молча; частично заполненные дают ошибку с номером строки.
 */
export function normalizeRows(table: RawTable, mapping: ColumnMapping): { rows: NormalizedRow[]; errors: RowError[] } {
  const rows: NormalizedRow[] = [];
  const errors: RowError[] = [];
  const occurrences = new Map<string, number>();
  const cell = (r: string[], key: FieldKey) => {
    const idx = mapping[key];
    return idx === undefined ? "" : (r[idx] ?? "").trim();
  };

  table.rows.forEach((r, i) => {
    const rowNumber = table.headerRowIndex + i + 2;
    const dateRaw = cell(r, "date");
    const sideRaw = cell(r, "side");
    if (!dateRaw && !sideRaw) return;

    const executedAt = parseDateTime(dateRaw, cell(r, "time"));
    const side = parseSide(sideRaw);
    const quantity = parseDecimalCell(cell(r, "quantity"));
    const price = parseDecimalCell(cell(r, "price"));
    // Регистр тикера сохраняем: у фьючерсов он смешанный (SiZ6); сравнение со справочником — без учёта регистра
    const ticker = cell(r, "ticker") || null;
    const isin = cell(r, "isin").toUpperCase() || null;

    const problems: string[] = [];
    if (!executedAt) problems.push(`не распознана дата «${dateRaw}»`);
    if (!side) problems.push(`не распознано направление «${sideRaw}»`);
    if (quantity === null || quantity === 0) problems.push("нет количества");
    if (price === null || price < 0) problems.push("нет цены");
    if (!ticker && !isin) problems.push("нет тикера или ISIN");
    if (problems.length) {
      errors.push({ rowNumber, message: problems.join(", ") });
      return;
    }

    const tradeId = cell(r, "tradeId");
    const accrued = parseDecimalCell(cell(r, "accruedInterest"));
    const base = {
      executedAt: executedAt!,
      ticker,
      isin,
      board: cell(r, "board").toUpperCase() || null,
      side: side!,
      // Некоторые брокеры пишут продажу отрицательным количеством
      quantity: Math.abs(quantity!),
      price: price!,
      brokerFee: Math.abs(parseDecimalCell(cell(r, "brokerFee")) ?? 0),
      exchangeFee: Math.abs(parseDecimalCell(cell(r, "exchangeFee")) ?? 0),
      accruedInterest: accrued === null ? null : Math.abs(accrued),
    };

    let externalId: string;
    if (tradeId) {
      externalId = `id:${tradeId}`;
    } else {
      // Стабильный id из содержимого строки: повторный импорт того же файла не создаёт дублей,
      // а одинаковые строки внутри файла различаются порядковым номером повтора
      const key = [base.executedAt.toISOString(), base.ticker ?? base.isin, base.side, base.quantity, base.price].join("|");
      const n = (occurrences.get(key) ?? 0) + 1;
      occurrences.set(key, n);
      externalId = `row:${hashString(key)}:${n}`;
    }
    rows.push({ rowNumber, externalId, ...base });
  });

  return { rows, errors };
}

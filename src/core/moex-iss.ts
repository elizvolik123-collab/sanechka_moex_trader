/**
 * Разбор ответов MOEX ISS (https://iss.moex.com/iss/reference/) — чистые функции без сети.
 * Формат ISS: блок { columns: string[], data: unknown[][] }; параметр iss.meta=off убирает метаданные.
 */

export type AssetClass = "SHARE" | "BOND" | "ETF" | "FUTURE" | "CURRENCY";

export type BoardConfig = {
  board: string;
  engine: string;
  market: string;
  assetClass: AssetClass;
  title: string;
};

/** Режимы торгов, которые загружаются в справочник инструментов. */
export const BOARDS: readonly BoardConfig[] = [
  { board: "TQBR", engine: "stock", market: "shares", assetClass: "SHARE", title: "Акции" },
  { board: "TQTF", engine: "stock", market: "shares", assetClass: "ETF", title: "Фонды" },
  { board: "TQOB", engine: "stock", market: "bonds", assetClass: "BOND", title: "ОФЗ" },
  { board: "TQCB", engine: "stock", market: "bonds", assetClass: "BOND", title: "Корпоративные облигации" },
  { board: "RFUD", engine: "futures", market: "forts", assetClass: "FUTURE", title: "Фьючерсы" },
  { board: "CETS", engine: "currency", market: "selt", assetClass: "CURRENCY", title: "Валюта" },
];

export function boardConfig(board: string): BoardConfig | undefined {
  return BOARDS.find((b) => b.board === board);
}

export type IssTable = { columns: string[]; data: unknown[][] };
export type IssRow = Record<string, unknown>;

/** Превращает таблицу ISS в массив объектов { КОЛОНКА: значение }. */
export function tableToRows(table: IssTable | undefined): IssRow[] {
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.data)) return [];
  return table.data.map((row) => Object.fromEntries(table.columns.map((col, i) => [col, row[i]])));
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** ISS отдаёт "0000-00-00" вместо пустой даты. */
const date = (v: unknown): Date | null => {
  const s = str(v);
  if (!s || s.startsWith("0000")) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** В ISS рубль обозначается SUR (а иногда RUB). */
const currency = (v: unknown): string => {
  const s = str(v)?.toUpperCase();
  return !s || s === "SUR" || s === "RUB" ? "RUB" : s;
};

/** Спецификация инструмента в нашем формате (соответствует модели Instrument). */
export type InstrumentSpec = {
  secid: string;
  board: string;
  assetClass: AssetClass;
  shortName: string;
  name: string;
  isin: string | null;
  currency: string;
  lotSize: number;
  minStep: number;
  stepPrice: number | null;
  faceValue: number | null;
  initialMargin: number | null;
  expiresAt: Date | null;
  decimals: number;
  prevPrice: number | null;
  prevPriceDate: Date | null;
};

/** Строка блока securities → спецификация. Возвращает null для неполных строк (без шага цены и т.п.). */
export function parseSecurityRow(row: IssRow, cfg: BoardConfig): InstrumentSpec | null {
  const secid = str(row.SECID);
  const minStep = num(row.MINSTEP);
  if (!secid || !minStep || minStep <= 0) return null;

  const shortName = str(row.SHORTNAME) ?? secid;
  const base = {
    secid,
    board: cfg.board,
    assetClass: cfg.assetClass,
    shortName,
    name: str(row.SECNAME) ?? shortName,
    isin: str(row.ISIN),
    minStep,
    decimals: num(row.DECIMALS) ?? 2,
    prevPriceDate: date(row.PREVDATE),
  };

  switch (cfg.assetClass) {
    case "FUTURE": {
      const stepPrice = num(row.STEPPRICE);
      if (!stepPrice) return null;
      return {
        ...base,
        currency: "RUB",
        lotSize: 1, // лот фьючерса — один контракт
        stepPrice,
        faceValue: null,
        initialMargin: num(row.INITIALMARGIN),
        expiresAt: date(row.LASTTRADEDATE),
        prevPrice: num(row.PREVSETTLEPRICE) ?? num(row.PREVPRICE),
        prevPriceDate: null,
      };
    }
    case "BOND":
      return {
        ...base,
        currency: currency(row.FACEUNIT ?? row.CURRENCYID),
        lotSize: num(row.LOTSIZE) ?? 1,
        stepPrice: null,
        faceValue: num(row.FACEVALUE),
        initialMargin: null,
        expiresAt: date(row.MATDATE),
        prevPrice: num(row.PREVPRICE) ?? num(row.PREVLEGALCLOSEPRICE),
      };
    default:
      return {
        ...base,
        currency: cfg.assetClass === "CURRENCY" ? "RUB" : currency(row.CURRENCYID),
        lotSize: num(row.LOTSIZE) ?? 1,
        stepPrice: null,
        faceValue: null,
        initialMargin: null,
        expiresAt: null,
        prevPrice: num(row.PREVPRICE) ?? num(row.PREVLEGALCLOSEPRICE) ?? num(row.PREVWAPRICE),
      };
  }
}

export type Quote = {
  secid: string;
  /** Цена последней сделки (для облигаций — в % от номинала) */
  last: number | null;
  /** Время последнего обновления котировки по Москве, ISO-строка с часовым поясом +03:00 */
  updatedAt: string | null;
};

/** Строка блока marketdata → котировка. UPDATETIME — время МСК, SYSTIME — "YYYY-MM-DD HH:MM:SS" МСК. */
export function parseMarketdataRow(row: IssRow): Quote | null {
  const secid = str(row.SECID);
  if (!secid) return null;
  const last = num(row.LAST) ?? num(row.MARKETPRICE) ?? num(row.LCURRENTPRICE);
  const sys = str(row.SYSTIME);
  const time = str(row.UPDATETIME) ?? str(row.TIME);
  let updatedAt: string | null = null;
  if (sys && time) updatedAt = `${sys.slice(0, 10)}T${time}+03:00`;
  else if (sys) updatedAt = `${sys.replace(" ", "T")}+03:00`;
  return { secid, last: last && last > 0 ? last : null, updatedAt };
}

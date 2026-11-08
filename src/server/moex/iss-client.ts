import { boardConfig, BOARDS, parseMarketdataRow, parseSecurityRow, tableToRows, type BoardConfig, type InstrumentSpec, type IssTable, type Quote } from "@/core/moex-iss";

/**
 * HTTP-клиент MOEX ISS. Базовый адрес меняется через MOEX_ISS_URL; для доступа через прокси
 * (ISS не отвечает зарубежным IP) задайте HTTPS_PROXY и NODE_USE_ENV_PROXY=1 — Node 24 подхватит их сам.
 */

const BASE_URL = (process.env.MOEX_ISS_URL ?? "https://iss.moex.com/iss").replace(/\/$/, "");
const TIMEOUT_MS = 15_000;

export class IssError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "IssError";
  }
}

async function issGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("iss.meta", "off");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    throw new IssError("MOEX ISS недоступна: нет ответа от сервера", error);
  }
  if (!response.ok) throw new IssError(`MOEX ISS ответила ошибкой ${response.status}`);
  return (await response.json()) as T;
}

const SECURITY_COLUMNS: Record<string, string> = {
  shares: "SECID,SHORTNAME,SECNAME,ISIN,LOTSIZE,MINSTEP,DECIMALS,CURRENCYID,PREVPRICE,PREVLEGALCLOSEPRICE,PREVWAPRICE,PREVDATE",
  bonds: "SECID,SHORTNAME,SECNAME,ISIN,LOTSIZE,MINSTEP,DECIMALS,FACEVALUE,FACEUNIT,CURRENCYID,MATDATE,PREVPRICE,PREVLEGALCLOSEPRICE,PREVDATE",
  forts: "SECID,SHORTNAME,SECNAME,MINSTEP,DECIMALS,STEPPRICE,INITIALMARGIN,LASTTRADEDATE,PREVSETTLEPRICE,PREVPRICE",
  selt: "SECID,SHORTNAME,SECNAME,LOTSIZE,MINSTEP,DECIMALS,PREVPRICE,PREVWAPRICE,PREVDATE",
};

const MARKETDATA_COLUMNS = "SECID,LAST,MARKETPRICE,LCURRENTPRICE,UPDATETIME,TIME,SYSTIME";

const boardPath = (cfg: BoardConfig) => `/engines/${cfg.engine}/markets/${cfg.market}/boards/${cfg.board}/securities`;

/** Все инструменты режима торгов. */
export async function fetchBoardSpecs(cfg: BoardConfig): Promise<InstrumentSpec[]> {
  const json = await issGet<{ securities?: IssTable }>(`${boardPath(cfg)}.json`, {
    "iss.only": "securities",
    "securities.columns": SECURITY_COLUMNS[cfg.market],
  });
  return tableToRows(json.securities)
    .map((row) => parseSecurityRow(row, cfg))
    .filter((s): s is InstrumentSpec => s !== null);
}

export async function fetchAllSpecs(): Promise<{ specs: InstrumentSpec[]; failedBoards: string[] }> {
  const results = await Promise.allSettled(BOARDS.map((b) => fetchBoardSpecs(b)));
  const specs: InstrumentSpec[] = [];
  const failedBoards: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") specs.push(...r.value);
    else failedBoards.push(BOARDS[i].board);
  });
  return { specs, failedBoards };
}

/** Котировка одного инструмента. */
export async function fetchQuote(board: string, secid: string): Promise<Quote | null> {
  const cfg = boardConfig(board);
  if (!cfg) throw new IssError(`Неизвестный режим торгов ${board}`);
  const json = await issGet<{ marketdata?: IssTable }>(`${boardPath(cfg)}/${encodeURIComponent(secid)}.json`, {
    "iss.only": "marketdata",
    "marketdata.columns": MARKETDATA_COLUMNS,
  });
  const [row] = tableToRows(json.marketdata);
  return row ? parseMarketdataRow(row) : null;
}

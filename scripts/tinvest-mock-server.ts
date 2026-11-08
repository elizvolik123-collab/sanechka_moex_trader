/**
 * Мок T-Invest REST API для локальной разработки и сквозной проверки синхронизации
 * (настоящий API не отвечает зарубежным IP). Данные вымышленные.
 *
 * Запуск: pnpm tinvest:mock  →  http://localhost:4010
 * В .env: TINVEST_API_URL=http://localhost:4010/rest и TINVEST_LOGO_CDN_URL=http://localhost:4010/logos
 * Принимается только вымышленный токен MOCK_TINVEST_TOKEN из локального .env.
 */
import "dotenv/config";
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 4010);
const MOCK_TOKEN = process.env.MOCK_TINVEST_TOKEN;
if (!MOCK_TOKEN || !/^t\.mock-[\w-]{13,}$/.test(MOCK_TOKEN)) {
  throw new Error("Задайте в .env вымышленный MOCK_TINVEST_TOKEN: t.mock- и минимум 13 букв, цифр или дефисов.");
}
const PAGE_SIZE = 5; // маленькие страницы, чтобы проверить пагинацию по курсору

const rub = (amount: number) => {
  const units = Math.trunc(amount);
  return { currency: "rub", units: String(units), nano: Math.round((amount - units) * 1e9) };
};

const INSTRUMENTS: Record<string, object> = {
  "uid-sber": { uid: "uid-sber", figi: "BBG004730N88", ticker: "SBER", classCode: "TQBR", isin: "RU0009029540", lot: 10, currency: "rub", name: "Сбер Банк", instrumentType: "share", minPriceIncrement: { units: "0", nano: 10_000_000 }, brand: { logoName: "sber.png" } },
  "uid-gazp": { uid: "uid-gazp", figi: "BBG004730RP0", ticker: "GAZP", classCode: "TQBR", isin: "RU0007661625", lot: 10, currency: "rub", name: "Газпром", instrumentType: "share", minPriceIncrement: { units: "0", nano: 10_000_000 }, brand: { logoName: "gazprom.png" } },
  "uid-vtbr": { uid: "uid-vtbr", figi: "BBG004730ZJ9", ticker: "VTBR", classCode: "TQBR", isin: "RU000A0JP5V6", lot: 1, currency: "rub", name: "Банк ВТБ", instrumentType: "share", minPriceIncrement: { units: "0", nano: 50_000_000 }, brand: { logoName: "missing-logo.png" } },
  "uid-si": { uid: "uid-si", figi: "FUTSI1226000", ticker: "SiZ6", classCode: "SPBFUT", lot: 1, currency: "rub", name: "Si-12.26 Курс доллар - рубль", instrumentType: "futures", minPriceIncrement: { units: "1", nano: 0 }, brand: { logoName: "si.png" } },
  "uid-ofz": { uid: "uid-ofz", figi: "BBG00R05JT04", ticker: "SU26238RMFS4", classCode: "TQOB", isin: "RU000A1038V6", lot: 1, currency: "rub", name: "ОФЗ 26238", instrumentType: "bond", minPriceIncrement: { units: "0", nano: 1_000_000 }, brand: { logoName: "minfin.png" } },
};

const op = (o: Record<string, unknown>) => ({ state: "OPERATION_STATE_EXECUTED", ...o });
const SBER = { instrumentUid: "uid-sber", figi: "BBG004730N88", ticker: "SBER", classCode: "TQBR", instrumentType: "share" };

const OPERATIONS: Record<string, object[]> = {
  "2001234567": [
    op({ id: "o1", type: "OPERATION_TYPE_INPUT", date: "2026-09-02T09:00:00Z", payment: rub(500000), description: "Пополнение" }),
    op({ id: "o2", type: "OPERATION_TYPE_BUY", date: "2026-10-01T07:00:00Z", ...SBER, price: rub(300.5), payment: rub(-30050), commission: rub(-15.03), quantity: "100", quantityDone: "100",
      tradesInfo: { trades: [
        { num: "9001", date: "2026-10-01T07:00:01Z", quantity: "60", price: rub(300.5) },
        { num: "9002", date: "2026-10-01T07:00:03Z", quantity: "40", price: rub(300.5) },
      ] } }),
    op({ id: "o3", type: "OPERATION_TYPE_SELL", date: "2026-10-01T11:30:00Z", ...SBER, price: rub(305.1), payment: rub(30510), quantity: "100", quantityDone: "100",
      tradesInfo: { trades: [{ num: "9003", date: "2026-10-01T11:30:00Z", quantity: "100", price: rub(305.1) }] } }),
    op({ id: "o4", parentOperationId: "o3", type: "OPERATION_TYPE_BROKER_FEE", date: "2026-10-01T11:30:00Z", ...SBER, payment: rub(-15.26) }),
    op({ id: "o5", type: "OPERATION_TYPE_BUY", date: "2026-10-02T08:00:00Z", instrumentUid: "uid-vtbr", ticker: "VTBR", classCode: "TQBR", price: rub(92.15), payment: rub(-9215), commission: rub(-4.61), quantity: "100",
      tradesInfo: { trades: [{ num: "9004", date: "2026-10-02T08:00:00Z", quantity: "100", price: rub(92.15) }] } }),
    op({ id: "o6", type: "OPERATION_TYPE_SELL", date: "2026-10-03T12:00:00Z", instrumentUid: "uid-vtbr", ticker: "VTBR", classCode: "TQBR", price: rub(95.4), payment: rub(9540), commission: rub(-4.77), quantity: "100",
      tradesInfo: { trades: [{ num: "9005", date: "2026-10-03T12:00:00Z", quantity: "100", price: rub(95.4) }] } }),
    op({ id: "o7", type: "OPERATION_TYPE_BUY", date: "2026-10-05T07:15:00Z", instrumentUid: "uid-si", ticker: "SiZ6", classCode: "SPBFUT", price: rub(96500), payment: rub(0), commission: rub(-4), quantity: "2",
      tradesInfo: { trades: [{ num: "9006", date: "2026-10-05T07:15:00Z", quantity: "2", price: rub(96500) }] } }),
    op({ id: "o8", type: "OPERATION_TYPE_ACCRUING_VARMARGIN", date: "2026-10-05T15:50:00Z", instrumentUid: "uid-si", ticker: "SiZ6", payment: rub(500) }),
    op({ id: "o9", type: "OPERATION_TYPE_SELL", date: "2026-10-06T08:20:00Z", instrumentUid: "uid-si", ticker: "SiZ6", classCode: "SPBFUT", price: rub(96750), payment: rub(0), commission: rub(-4), quantity: "2",
      tradesInfo: { trades: [{ num: "9007", date: "2026-10-06T08:20:00Z", quantity: "2", price: rub(96750) }] } }),
    op({ id: "o10", type: "OPERATION_TYPE_BUY", date: "2026-10-09T08:11:00Z", instrumentUid: "uid-ofz", ticker: "SU26238RMFS4", classCode: "TQOB", price: rub(589), payment: rub(-5890), accruedInt: rub(-150.2), commission: rub(-2.95), quantity: "10",
      tradesInfo: { trades: [{ num: "9008", date: "2026-10-09T08:11:00Z", quantity: "10", price: rub(589) }] } }),
    op({ id: "o11", type: "OPERATION_TYPE_SELL", date: "2026-10-13T09:40:00Z", instrumentUid: "uid-ofz", ticker: "SU26238RMFS4", classCode: "TQOB", price: rub(584), payment: rub(5840), accruedInt: rub(160.8), commission: rub(-2.92), quantity: "10",
      tradesInfo: { trades: [{ num: "9009", date: "2026-10-13T09:40:00Z", quantity: "10", price: rub(584) }] } }),
    op({ id: "o12", type: "OPERATION_TYPE_DIVIDEND", date: "2026-10-14T10:00:00Z", ...SBER, payment: rub(3300) }),
    op({ id: "o13", type: "OPERATION_TYPE_DIVIDEND_TAX", date: "2026-10-14T10:00:00Z", ...SBER, payment: rub(-429) }),
    op({ id: "o14", type: "OPERATION_TYPE_SERVICE_FEE", date: "2026-10-15T00:00:00Z", payment: rub(-99), description: "Тариф" }),
    op({ id: "o15", type: "OPERATION_TYPE_BUY", state: "OPERATION_STATE_CANCELED", date: "2026-10-16T07:00:00Z", ...SBER, price: rub(310), quantity: "10" }),
    op({ id: "o16", type: "OPERATION_TYPE_BUY", date: "2026-10-16T14:00:00Z", instrumentUid: "uid-aapl", ticker: "AAPL", classCode: "SPBXM", price: { currency: "usd", units: "180", nano: 0 }, quantity: "1" }),
    op({ id: "o17", type: "OPERATION_TYPE_INPUT_SECURITIES", date: "2026-10-17T10:00:00Z", ...SBER, quantity: "50" }),
  ],
  "2007654321": [
    op({ id: "i1", type: "OPERATION_TYPE_INPUT", date: "2026-10-01T09:00:00Z", payment: rub(100000) }),
    op({ id: "i2", type: "OPERATION_TYPE_BUY", date: "2026-10-02T09:00:00Z", instrumentUid: "uid-gazp", ticker: "GAZP", classCode: "TQBR", price: rub(120.4), payment: rub(-12040), commission: rub(-6.02), quantity: "100",
      tradesInfo: { trades: [{ num: "9101", date: "2026-10-02T09:00:00Z", quantity: "100", price: rub(120.4) }] } }),
  ],
};

// Однопиксельный PNG — «логотип» для проверки кэша логотипов
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const json = (res: import("node:http").ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = req.url ?? "";
  if (req.method === "GET" && url.startsWith("/logos/")) {
    if (url.includes("missing-logo")) return json(res, 404, {});
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(PNG);
  }
  if (req.headers.authorization !== `Bearer ${MOCK_TOKEN}`) {
    return json(res, 401, { code: 16, message: "authentication token is missing or invalid" });
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const method = url.split(".").pop();
  console.log(new Date().toISOString(), method, JSON.stringify(body));

  switch (method) {
    case "UsersService/GetAccounts":
      return json(res, 200, {
        accounts: [
          { id: "2001234567", type: "ACCOUNT_TYPE_TINKOFF", name: "Брокерский счёт", status: "ACCOUNT_STATUS_OPEN", openedDate: "2026-09-01T00:00:00Z", accessLevel: "ACCOUNT_ACCESS_LEVEL_READ_ONLY" },
          { id: "2007654321", type: "ACCOUNT_TYPE_TINKOFF_IIS", name: "ИИС", status: "ACCOUNT_STATUS_OPEN", openedDate: "2026-09-15T00:00:00Z", accessLevel: "ACCOUNT_ACCESS_LEVEL_READ_ONLY" },
        ],
      });
    case "OperationsService/GetOperationsByCursor": {
      const from = body.from ? Date.parse(body.from) : 0;
      const to = body.to ? Date.parse(body.to) : Infinity;
      const all = (OPERATIONS[body.accountId] ?? []).filter((o) => {
        const t = Date.parse((o as { date: string }).date);
        const stateOk = !body.state || (o as { state: string }).state === body.state;
        return t >= from && t <= to && stateOk;
      });
      const start = body.cursor ? Number(body.cursor) : 0;
      const size = Math.min(body.limit ?? 100, PAGE_SIZE);
      const items = all.slice(start, start + size);
      const hasNext = start + size < all.length;
      return json(res, 200, { hasNext, nextCursor: hasNext ? String(start + size) : "", items });
    }
    case "InstrumentsService/GetInstrumentBy": {
      const instrument = INSTRUMENTS[body.id];
      return instrument ? json(res, 200, { instrument }) : json(res, 404, { code: 5, message: "instrument not found" });
    }
    case "InstrumentsService/BondBy":
      return json(res, 200, { instrument: { ...INSTRUMENTS[body.id], nominal: rub(1000) } });
    case "InstrumentsService/GetFuturesMargin":
      return json(res, 200, { initialMarginOnBuy: rub(15500), initialMarginOnSell: rub(15500), minPriceIncrement: { units: "1", nano: 0 }, minPriceIncrementAmount: { units: "1", nano: 0 } });
    default:
      return json(res, 404, { code: 12, message: `method ${method} not implemented in mock` });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Мок T-Invest API: http://127.0.0.1:${PORT}/rest`));

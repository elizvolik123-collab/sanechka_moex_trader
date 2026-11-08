import Decimal from "decimal.js";
import { hashString } from "@/core/import/values";
import type { AssetClass } from "@/core/risk";
import type { BrokerAccountInfo, BrokerInstrumentInfo, BrokerInstrumentRef, CashOpDto, CashOpType, ExecutionDto, OperationsBatch } from "../types";

/**
 * Разбор JSON T-Invest API (proto → JSON: поля в camelCase, int64 — строками, enum — именами).
 * Чистые функции без сети — покрыты тестами.
 */

export type MoneyValue = { currency?: string; units?: string | number; nano?: number };
export type Quotation = { units?: string | number; nano?: number };

export type ApiAccount = { id: string; name?: string; status?: string; openedDate?: string; closedDate?: string };

export type ApiTrade = { num?: string; date?: string; quantity?: string | number; price?: MoneyValue };

export type ApiOperation = {
  id: string;
  parentOperationId?: string;
  date?: string;
  type?: string;
  state?: string;
  description?: string;
  name?: string;
  instrumentUid?: string;
  figi?: string;
  ticker?: string;
  classCode?: string;
  instrumentKind?: string;
  payment?: MoneyValue;
  price?: MoneyValue;
  commission?: MoneyValue;
  accruedInt?: MoneyValue;
  quantity?: string | number;
  quantityDone?: string | number;
  tradesInfo?: { trades?: ApiTrade[] };
};

export type ApiInstrument = {
  uid: string;
  figi?: string;
  ticker?: string;
  classCode?: string;
  isin?: string;
  lot?: number;
  currency?: string;
  name?: string;
  instrumentType?: string;
  instrumentKind?: string;
  minPriceIncrement?: Quotation;
  brand?: { logoName?: string };
};

/** MoneyValue/Quotation → Decimal: units + nano / 1e9 (у отрицательных сумм оба поля отрицательные). */
export function toDecimal(v: MoneyValue | Quotation | undefined | null): Decimal {
  if (!v) return new Decimal(0);
  return new Decimal(String(v.units ?? 0)).add(new Decimal(v.nano ?? 0).div(1e9));
}

const toNumber = (v: MoneyValue | Quotation | undefined | null) => toDecimal(v).toNumber();
const currencyOf = (v: MoneyValue | undefined) => (v?.currency ?? "rub").toUpperCase();

export function mapAccount(a: ApiAccount): BrokerAccountInfo {
  return {
    externalId: a.id,
    name: a.name || `Счёт ${a.id}`,
    openedAt: a.openedDate ? new Date(a.openedDate) : null,
    closed: a.status === "ACCOUNT_STATUS_CLOSED",
  };
}

/** Класс-код T-Invest → режим торгов MOEX. Фьючерсы у брокера в SPBFUT, на бирже — RFUD. */
export function classCodeToBoard(classCode: string | undefined | null): string {
  const c = (classCode ?? "").toUpperCase();
  return c === "SPBFUT" ? "RFUD" : c;
}

const KIND_TO_CLASS: Record<string, AssetClass> = {
  share: "SHARE",
  bond: "BOND",
  etf: "ETF",
  futures: "FUTURE",
  currency: "CURRENCY",
  INSTRUMENT_TYPE_SHARE: "SHARE",
  INSTRUMENT_TYPE_BOND: "BOND",
  INSTRUMENT_TYPE_ETF: "ETF",
  INSTRUMENT_TYPE_FUTURES: "FUTURE",
  INSTRUMENT_TYPE_CURRENCY: "CURRENCY",
};

export function mapInstrument(
  i: ApiInstrument,
  extra: { faceValue?: number | null; stepPrice?: number | null; initialMargin?: number | null } = {},
): BrokerInstrumentInfo {
  const assetClass = KIND_TO_CLASS[i.instrumentType ?? ""] ?? KIND_TO_CLASS[i.instrumentKind ?? ""] ?? "OTHER";
  return {
    uid: i.uid,
    figi: i.figi || null,
    ticker: i.ticker ?? i.uid,
    board: classCodeToBoard(i.classCode),
    isin: i.isin || null,
    name: i.name ?? i.ticker ?? i.uid,
    assetClass,
    // Лот фьючерса — один контракт
    lotSize: assetClass === "FUTURE" ? 1 : Math.max(1, i.lot ?? 1),
    minStep: toNumber(i.minPriceIncrement),
    stepPrice: extra.stepPrice ?? null,
    faceValue: extra.faceValue ?? null,
    initialMargin: extra.initialMargin ?? null,
    currency: (i.currency ?? "rub").toUpperCase() === "RUB" ? "RUB" : (i.currency ?? "").toUpperCase(),
    logoName: i.brand?.logoName || null,
  };
}

const BUY_TYPES = new Set(["OPERATION_TYPE_BUY", "OPERATION_TYPE_BUY_CARD", "OPERATION_TYPE_BUY_MARGIN", "OPERATION_TYPE_DELIVERY_BUY"]);
const SELL_TYPES = new Set(["OPERATION_TYPE_SELL", "OPERATION_TYPE_SELL_CARD", "OPERATION_TYPE_SELL_MARGIN", "OPERATION_TYPE_DELIVERY_SELL"]);

const CASH_TYPES: Record<string, CashOpType> = {
  OPERATION_TYPE_INPUT: "DEPOSIT",
  OPERATION_TYPE_INPUT_ACQUIRING: "DEPOSIT",
  OPERATION_TYPE_OUTPUT: "WITHDRAWAL",
  OPERATION_TYPE_DIVIDEND: "DIVIDEND",
  OPERATION_TYPE_DIV_EXT: "DIVIDEND",
  OPERATION_TYPE_DIVIDEND_TRANSFER: "DIVIDEND",
  OPERATION_TYPE_COUPON: "COUPON",
  OPERATION_TYPE_BOND_REPAYMENT: "AMORTIZATION",
  OPERATION_TYPE_BOND_REPAYMENT_FULL: "AMORTIZATION",
  OPERATION_TYPE_ACCRUING_VARMARGIN: "VARMARGIN",
  OPERATION_TYPE_WRITING_OFF_VARMARGIN: "VARMARGIN",
  OPERATION_TYPE_SERVICE_FEE: "FEE",
  OPERATION_TYPE_MARGIN_FEE: "FEE",
  OPERATION_TYPE_SUCCESS_FEE: "FEE",
  OPERATION_TYPE_TRACK_MFEE: "FEE",
  OPERATION_TYPE_TRACK_PFEE: "FEE",
  OPERATION_TYPE_CASH_FEE: "FEE",
  OPERATION_TYPE_OUT_FEE: "FEE",
  OPERATION_TYPE_OUTPUT_PENALTY: "FEE",
  OPERATION_TYPE_BROKER_FEE: "FEE",
  OPERATION_TYPE_OVERNIGHT: "OTHER",
};

const isTaxType = (t: string) => t.includes("TAX") || t === "OPERATION_TYPE_OUT_STAMP_DUTY";

/**
 * Операции, которые меняют позицию без сделки (переводы бумаг, экспирации), в MVP не загружаются:
 * сделки по ним собрать нельзя. Они попадают в статистику пропусков, чтобы пользователь знал о них.
 * TODO: экспирация фьючерсов — закрывать позицию по расчётной цене.
 */
const POSITION_TYPES_SKIPPED = new Set([
  "OPERATION_TYPE_INPUT_SECURITIES",
  "OPERATION_TYPE_OUTPUT_SECURITIES",
  "OPERATION_TYPE_FUTURE_EXPIRATION",
  "OPERATION_TYPE_OPTION_EXPIRATION",
]);

function refOf(op: ApiOperation): BrokerInstrumentRef | null {
  if (!op.instrumentUid && !op.figi && !op.ticker) return null;
  return { uid: op.instrumentUid || null, figi: op.figi || null, ticker: op.ticker || null, classCode: op.classCode || null };
}

/** Распределяет сумму по долям количества, без потери копеек (остаток — последнему). */
function allocate(total: Decimal, quantities: Decimal[]): Decimal[] {
  const sum = quantities.reduce((s, q) => s.add(q), new Decimal(0));
  if (sum.isZero()) return quantities.map(() => new Decimal(0));
  let rest = total;
  return quantities.map((q, i) => {
    if (i === quantities.length - 1) return rest;
    const part = total.mul(q).div(sum).toDecimalPlaces(6);
    rest = rest.sub(part);
    return part;
  });
}

/**
 * Операции счёта → исполнения и денежные операции.
 *
 * - Исполнение = одна биржевая сделка из tradesInfo; id — номер сделки (id операции у T-Invest может меняться).
 * - Комиссия берётся из поля commission операции, а если оно пустое — из дочерних операций BROKER_FEE
 *   (parentOperationId). Привязанные к сделкам комиссии не дублируются как денежные операции.
 * - Комиссия и НКД операции распределяются по её сделкам пропорционально количеству.
 */
export function mapOperations(ops: readonly ApiOperation[]): OperationsBatch {
  const executions: ExecutionDto[] = [];
  const cashOps: CashOpDto[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  const executed = ops.filter((o) => !o.state || o.state === "OPERATION_STATE_EXECUTED");
  const tradeIds = new Set(executed.filter((o) => BUY_TYPES.has(o.type ?? "") || SELL_TYPES.has(o.type ?? "")).map((o) => o.id));

  // Комиссии-операции, привязанные к сделкам: parentId → сумма (по модулю)
  const childFees = new Map<string, Decimal>();
  for (const o of executed) {
    if (o.type === "OPERATION_TYPE_BROKER_FEE" && o.parentOperationId && tradeIds.has(o.parentOperationId)) {
      const prev = childFees.get(o.parentOperationId) ?? new Decimal(0);
      childFees.set(o.parentOperationId, prev.add(toDecimal(o.payment).abs()));
    }
  }

  const cashOccurrences = new Map<string, number>();

  for (const o of executed) {
    const type = o.type ?? "OPERATION_TYPE_UNSPECIFIED";

    if (BUY_TYPES.has(type) || SELL_TYPES.has(type)) {
      const currency = currencyOf(o.price ?? o.payment);
      if (currency !== "RUB") {
        // TODO: пересчёт по курсу ЦБ для инструментов в иностранной валюте
        skip("сделки в иностранной валюте");
        continue;
      }
      const ref = refOf(o);
      if (!ref) {
        skip("сделки без инструмента");
        continue;
      }
      const trades = (o.tradesInfo?.trades ?? []).filter((t) => Number(t.quantity ?? 0) > 0);
      const fills = trades.length
        ? trades.map((t) => ({
            externalId: `trade:${t.num ?? `${o.id}:${t.date}`}`,
            date: new Date(t.date ?? o.date ?? 0),
            qty: new Decimal(String(t.quantity)),
            price: toDecimal(t.price ?? o.price),
          }))
        : [
            {
              externalId: `op:${o.id}`,
              date: new Date(o.date ?? 0),
              qty: new Decimal(String(o.quantityDone ?? o.quantity ?? 0)),
              price: toDecimal(o.price),
            },
          ];
      if (fills.some((f) => f.qty.lte(0))) {
        skip("сделки без количества");
        continue;
      }

      const commission = toDecimal(o.commission).abs();
      const fee = commission.gt(0) ? commission : (childFees.get(o.id) ?? new Decimal(0));
      const fees = allocate(fee, fills.map((f) => f.qty));
      const ai = o.accruedInt ? toDecimal(o.accruedInt).abs() : null;
      const ais = ai ? allocate(ai, fills.map((f) => f.qty)) : null;

      fills.forEach((f, i) => {
        executions.push({
          externalId: f.externalId,
          instrument: ref,
          side: BUY_TYPES.has(type) ? "BUY" : "SELL",
          executedAt: f.date,
          price: f.price.toNumber(),
          quantity: f.qty.toNumber(),
          brokerFee: fees[i].toNumber(),
          accruedInterest: ais ? ais[i].toNumber() : null,
          currency,
        });
      });
      continue;
    }

    if (type === "OPERATION_TYPE_BROKER_FEE" && o.parentOperationId && tradeIds.has(o.parentOperationId)) continue;
    if (POSITION_TYPES_SKIPPED.has(type)) {
      skip(type === "OPERATION_TYPE_FUTURE_EXPIRATION" || type === "OPERATION_TYPE_OPTION_EXPIRATION" ? "экспирации" : "переводы ценных бумаг");
      continue;
    }

    const cashType = CASH_TYPES[type] ?? (isTaxType(type) ? "TAX" : null);
    if (!cashType) {
      skip("прочие операции");
      continue;
    }
    const amount = toDecimal(o.payment);
    if (amount.isZero()) continue;
    const ref = refOf(o);
    // Id операции T-Invest может меняться — ключ строим из содержимого
    const key = [type, o.date, amount.toString(), currencyOf(o.payment), ref?.uid ?? ref?.figi ?? ""].join("|");
    const n = (cashOccurrences.get(key) ?? 0) + 1;
    cashOccurrences.set(key, n);
    cashOps.push({
      externalId: `cash:${hashString(key)}:${n}`,
      type: cashType,
      amount: amount.toNumber(),
      currency: currencyOf(o.payment),
      occurredAt: new Date(o.date ?? 0),
      instrument: ref,
      description: o.description || o.name || null,
    });
  }

  return { executions, cashOps, skipped };
}

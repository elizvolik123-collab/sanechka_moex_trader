import { describe, expect, it } from "vitest";
import { classCodeToBoard, mapAccount, mapInstrument, mapOperations, toDecimal, type ApiOperation } from "./mapping";

const rub = (units: number | string, nano = 0) => ({ currency: "rub", units: String(units), nano });

const SBER = { instrumentUid: "uid-sber", figi: "BBG004730N88", ticker: "SBER", classCode: "TQBR" };

const BUY_TWO_FILLS: ApiOperation = {
  id: "op-1",
  type: "OPERATION_TYPE_BUY",
  state: "OPERATION_STATE_EXECUTED",
  date: "2026-10-01T07:00:00Z",
  ...SBER,
  price: rub(300, 500_000_000),
  payment: rub(-9015),
  commission: rub(-4, -500_000_000),
  quantity: "30",
  quantityDone: "30",
  tradesInfo: {
    trades: [
      { num: "1001", date: "2026-10-01T07:00:01Z", quantity: "20", price: rub(300, 500_000_000) },
      { num: "1002", date: "2026-10-01T07:00:02Z", quantity: "10", price: rub(300, 500_000_000) },
    ],
  },
};

describe("toDecimal", () => {
  it("units + nano, отрицательные суммы", () => {
    expect(toDecimal(rub(12, 340_000_000)).toNumber()).toBe(12.34);
    expect(toDecimal({ units: "-12", nano: -500_000_000 }).toNumber()).toBe(-12.5);
    expect(toDecimal(undefined).toNumber()).toBe(0);
  });
});

describe("mapOperations: сделки", () => {
  it("исполнение на каждую биржевую сделку, комиссия делится пропорционально", () => {
    const { executions, cashOps } = mapOperations([BUY_TWO_FILLS]);
    expect(cashOps).toEqual([]);
    expect(executions).toHaveLength(2);
    expect(executions[0]).toMatchObject({
      externalId: "trade:1001",
      side: "BUY",
      price: 300.5,
      quantity: 20,
      brokerFee: 3,
      currency: "RUB",
      instrument: { uid: "uid-sber", ticker: "SBER", classCode: "TQBR" },
    });
    expect(executions[1]).toMatchObject({ externalId: "trade:1002", quantity: 10, brokerFee: 1.5 });
    expect(executions[0].executedAt.toISOString()).toBe("2026-10-01T07:00:01.000Z");
  });

  it("комиссия из дочерней операции BROKER_FEE, сама она не становится денежной операцией", () => {
    const sell: ApiOperation = {
      id: "op-2",
      type: "OPERATION_TYPE_SELL",
      date: "2026-10-02T08:00:00Z",
      ...SBER,
      price: rub(305),
      payment: rub(3050),
      quantity: "10",
      tradesInfo: { trades: [{ num: "2001", date: "2026-10-02T08:00:00Z", quantity: "10", price: rub(305) }] },
    };
    const fee: ApiOperation = { id: "op-3", parentOperationId: "op-2", type: "OPERATION_TYPE_BROKER_FEE", payment: rub(-1, -530_000_000), date: "2026-10-02T08:00:00Z" };
    const { executions, cashOps } = mapOperations([sell, fee]);
    expect(executions[0]).toMatchObject({ side: "SELL", brokerFee: 1.53 });
    expect(cashOps).toEqual([]);
  });

  it("операция без tradesInfo — одно исполнение с id операции", () => {
    const op: ApiOperation = { id: "op-9", type: "OPERATION_TYPE_BUY", date: "2026-10-03T08:00:00Z", ...SBER, price: rub(300), quantity: "5", quantityDone: "5" };
    expect(mapOperations([op]).executions[0]).toMatchObject({ externalId: "op:op-9", quantity: 5 });
  });

  it("НКД распределяется по сделкам", () => {
    const op: ApiOperation = {
      id: "op-b",
      type: "OPERATION_TYPE_BUY",
      date: "2026-10-03T08:00:00Z",
      instrumentUid: "uid-ofz",
      ticker: "SU26238RMFS4",
      classCode: "TQOB",
      price: rub(589),
      accruedInt: rub(-30),
      tradesInfo: {
        trades: [
          { num: "1", date: "2026-10-03T08:00:00Z", quantity: "1", price: rub(589) },
          { num: "2", date: "2026-10-03T08:00:00Z", quantity: "2", price: rub(589) },
        ],
      },
    };
    expect(mapOperations([op]).executions.map((e) => e.accruedInterest)).toEqual([10, 20]);
  });

  it("пропускает отменённые, валютные и операции, меняющие позицию без сделки", () => {
    const { executions, skipped } = mapOperations([
      { ...BUY_TWO_FILLS, id: "x1", state: "OPERATION_STATE_CANCELED" },
      { ...BUY_TWO_FILLS, id: "x2", price: { currency: "usd", units: "10" } },
      { id: "x3", type: "OPERATION_TYPE_INPUT_SECURITIES", ...SBER, quantity: "10" },
      { id: "x4", type: "OPERATION_TYPE_FUTURE_EXPIRATION", ticker: "SiZ6", quantity: "1" },
    ]);
    expect(executions).toEqual([]);
    expect(skipped).toEqual({ "сделки в иностранной валюте": 1, "переводы ценных бумаг": 1, экспирации: 1 });
  });
});

describe("mapOperations: денежные операции", () => {
  const ops: ApiOperation[] = [
    { id: "c1", type: "OPERATION_TYPE_INPUT", payment: rub(100000), date: "2026-09-01T10:00:00Z" },
    { id: "c2", type: "OPERATION_TYPE_OUTPUT", payment: rub(-5000), date: "2026-09-02T10:00:00Z" },
    { id: "c3", type: "OPERATION_TYPE_DIVIDEND", payment: rub(330), date: "2026-09-03T10:00:00Z", ...SBER },
    { id: "c4", type: "OPERATION_TYPE_DIVIDEND_TAX", payment: rub(-43), date: "2026-09-03T10:00:00Z", ...SBER },
    { id: "c5", type: "OPERATION_TYPE_ACCRUING_VARMARGIN", payment: rub(250), date: "2026-09-04T16:00:00Z" },
    { id: "c6", type: "OPERATION_TYPE_WRITING_OFF_VARMARGIN", payment: rub(-120), date: "2026-09-05T16:00:00Z" },
    { id: "c7", type: "OPERATION_TYPE_SERVICE_FEE", payment: rub(-99), date: "2026-09-06T10:00:00Z" },
    { id: "c8", type: "OPERATION_TYPE_COUPON", payment: rub(36, 900_000_000), date: "2026-09-07T10:00:00Z" },
  ];

  it("типы и знаки", () => {
    const { cashOps } = mapOperations(ops);
    expect(cashOps.map((c) => [c.type, c.amount])).toEqual([
      ["DEPOSIT", 100000],
      ["WITHDRAWAL", -5000],
      ["DIVIDEND", 330],
      ["TAX", -43],
      ["VARMARGIN", 250],
      ["VARMARGIN", -120],
      ["FEE", -99],
      ["COUPON", 36.9],
    ]);
  });

  it("id денежных операций не зависят от id операции T-Invest (он может меняться)", () => {
    const a = mapOperations(ops).cashOps.map((c) => c.externalId);
    const b = mapOperations(ops.map((o) => ({ ...o, id: `${o.id}-new` }))).cashOps.map((c) => c.externalId);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(ops.length);
  });
});

describe("счета и инструменты", () => {
  it("счёт", () => {
    expect(mapAccount({ id: "2000", name: "ИИС", status: "ACCOUNT_STATUS_CLOSED", openedDate: "2021-01-10T00:00:00Z" })).toEqual({
      externalId: "2000",
      name: "ИИС",
      closed: true,
      openedAt: new Date("2021-01-10T00:00:00Z"),
    });
    expect(mapAccount({ id: "1" }).name).toBe("Счёт 1");
  });

  it("класс-код фьючерсов → режим торгов MOEX", () => {
    expect(classCodeToBoard("SPBFUT")).toBe("RFUD");
    expect(classCodeToBoard("TQBR")).toBe("TQBR");
  });

  it("инструмент: тип, лот, шаг, логотип", () => {
    const fut = mapInstrument(
      { uid: "u1", ticker: "SiZ6", classCode: "SPBFUT", lot: 1000, instrumentType: "futures", minPriceIncrement: { units: "1", nano: 0 }, brand: { logoName: "SI.png" } },
      { stepPrice: 1, initialMargin: 15000 },
    );
    expect(fut).toMatchObject({ assetClass: "FUTURE", board: "RFUD", lotSize: 1, minStep: 1, stepPrice: 1, initialMargin: 15000, logoName: "SI.png" });
    const share = mapInstrument({ uid: "u2", ticker: "SBER", classCode: "TQBR", lot: 10, instrumentType: "share", minPriceIncrement: { units: "0", nano: 10_000_000 }, currency: "rub" });
    expect(share).toMatchObject({ assetClass: "SHARE", lotSize: 10, minStep: 0.01, currency: "RUB" });
  });
});

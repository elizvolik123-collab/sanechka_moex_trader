import { describe, expect, it } from "vitest";
import { calculatePosition, lotValue, roundToStep, stepValuePerLot, type InstrumentParams, type RiskInput } from "./risk";

const SBER: InstrumentParams = { assetClass: "SHARE", lotSize: 10, minStep: 0.01 };
const LKOH: InstrumentParams = { assetClass: "SHARE", lotSize: 1, minStep: 0.5 };
const SI: InstrumentParams = { assetClass: "FUTURE", lotSize: 1, minStep: 1, stepPrice: 1, initialMargin: 15000 };
const OFZ: InstrumentParams = { assetClass: "BOND", lotSize: 1, minStep: 0.01, faceValue: 1000 };

const base: RiskInput = {
  depositRub: 100_000,
  riskPct: 1,
  direction: "LONG",
  entryPrice: 300,
  stopMode: "points",
  stopValue: 3,
  rewardRatio: 3,
};

function calc(instrument: InstrumentParams, input: Partial<RiskInput>) {
  const outcome = calculatePosition(instrument, { ...base, ...input });
  if (!outcome.ok) throw new Error(`Ожидался расчёт, получены ошибки: ${JSON.stringify(outcome.errors)}`);
  return outcome.result;
}

describe("roundToStep / стоимость шага", () => {
  it("округляет цену до шага", () => {
    expect(roundToStep(300.004, 0.01).toNumber()).toBe(300);
    expect(roundToStep(7001.3, 0.5).toNumber()).toBe(7001.5);
    expect(roundToStep(0.30000000000000004, 0.1).toNumber()).toBe(0.3);
  });

  it("стоимость шага на лот для разных классов активов", () => {
    expect(stepValuePerLot(SBER).toNumber()).toBe(0.1);
    expect(stepValuePerLot(SI).toNumber()).toBe(1);
    expect(stepValuePerLot(OFZ).toNumber()).toBe(0.1);
    expect(lotValue(OFZ, 95.5).toNumber()).toBe(955);
    expect(lotValue(SI, 95000).toNumber()).toBe(95000);
  });
});

describe("калькулятор: акции", () => {
  it("лонг, люфт в пунктах", () => {
    const r = calc(SBER, {});
    expect(r).toMatchObject({
      riskRub: 1000,
      entryPrice: 300,
      stopPrice: 297,
      takePrice: 309,
      stopDistance: 3,
      stopSteps: 300,
      stepValuePerLot: 0.1,
      riskPerLot: 30,
      lots: 33,
      quantity: 330,
      positionValue: 99000,
      depositSharePct: 99,
      potentialLossRub: 990,
      potentialProfitRub: 2970,
      actualRiskPct: 0.99,
      marginRequired: null,
    });
    expect(r.warnings).toEqual([]);
  });

  it("шорт, люфт в процентах", () => {
    const r = calc(SBER, {
      depositRub: 50_000,
      riskPct: 2,
      direction: "SHORT",
      entryPrice: 120,
      stopMode: "percent",
      stopValue: 2,
      rewardRatio: 2,
    });
    expect(r).toMatchObject({ stopPrice: 122.4, takePrice: 115.2, riskPerLot: 24, lots: 41, quantity: 410, positionValue: 49200 });
  });

  it("люфт ценой стопа", () => {
    const r = calc(SBER, { stopMode: "price", stopValue: 295 });
    expect(r).toMatchObject({ stopPrice: 295, stopDistance: 5, riskPerLot: 50, lots: 20, takePrice: 315 });
  });

  it("округляет цены до шага: стоп — дальше от входа, тейк — ближе ко входу", () => {
    const r = calc(SBER, { entryPrice: 301.37, stopMode: "percent", stopValue: 1.5 });
    // 301.37 × 0.985 = 296.84945 → стоп 296.84 (вниз для лонга)
    expect(r.stopPrice).toBe(296.84);
    expect(r.stopDistance).toBe(4.53);
    // тейк 301.37 + 13.59 = 314.96 — уже на сетке
    expect(r.takePrice).toBe(314.96);
    expect(r.warnings).toEqual([]);
  });

  it("предупреждает, если введённые цены пришлось округлить", () => {
    const r = calc(SBER, { entryPrice: 300.004, stopMode: "price", stopValue: 297.555 });
    expect(r.entryPrice).toBe(300);
    expect(r.stopPrice).toBe(297.55);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        { code: "PRICE_ROUNDED", field: "entryPrice" },
        { code: "PRICE_ROUNDED", field: "stopPrice" },
      ]),
    );
  });

  it("учитывает комиссию на входе и выходе", () => {
    const r = calc(SBER, { commissionPct: 0.05 });
    // 30 ₽ движения + 1.5 ₽ (вход 3000 ₽) + 1.485 ₽ (выход по стопу 2970 ₽)
    expect(r.riskPerLot).toBe(32.99);
    expect(r.lots).toBe(30);
    expect(r.potentialLossRub).toBe(989.55);
    expect(r.commissionRub).toBe(89.55);
    // 90 ₽ движения − 1.5 ₽ − 1.545 ₽ (выход по тейку 3090 ₽) = 86.955 ₽ на лот
    expect(r.potentialProfitRub).toBe(2608.65);
  });

  it("риск меньше одного лота → 0 лотов и предупреждение", () => {
    const r = calc(LKOH, { depositRub: 10_000, entryPrice: 7000, stopValue: 500 });
    expect(r.lots).toBe(0);
    expect(r.warnings).toContainEqual({ code: "ZERO_LOTS", riskPerLot: 500, riskRub: 100 });
  });

  it("позиция больше счёта → предупреждение о плече", () => {
    // 1 пункт = 100 шагов × 0.1 ₽ = 10 ₽ на лот → 500 ₽ риска = 50 лотов по 3000 ₽
    const r = calc(SBER, { depositRub: 10_000, riskPct: 5, stopValue: 1 });
    expect(r.lots).toBe(50);
    expect(r.positionValue).toBe(150_000);
    expect(r.warnings).toContainEqual({ code: "LEVERAGE", leverage: 15 });
  });
});

describe("калькулятор: фьючерсы", () => {
  it("размер позиции по стоимости шага и ГО", () => {
    const r = calc(SI, { entryPrice: 95_000, stopValue: 300 });
    expect(r).toMatchObject({
      stopPrice: 94_700,
      takePrice: 95_900,
      riskPerLot: 300,
      lots: 3,
      quantity: 3,
      marginRequired: 45_000,
      depositSharePct: 45,
      positionValue: 285_000,
      potentialProfitRub: 2700,
    });
    expect(r.warnings).toEqual([]);
  });

  it("ГО позиции больше счёта", () => {
    const r = calc(SI, { depositRub: 20_000, riskPct: 10, entryPrice: 95_000, stopValue: 100 });
    expect(r.lots).toBe(20);
    expect(r.warnings).toContainEqual({ code: "MARGIN_EXCEEDS_DEPOSIT", marginRequired: 300_000 });
  });

  it("ГО одного контракта больше счёта", () => {
    const r = calc(SI, { depositRub: 10_000, entryPrice: 95_000, stopValue: 50 });
    expect(r.warnings).toContainEqual({ code: "ONE_CONTRACT_MARGIN_EXCEEDS_DEPOSIT", initialMargin: 15_000 });
  });

  it("стоимость шага, отличная от шага цены (RTS: шаг 10, стоимость шага ~ 7.5 ₽)", () => {
    const RI: InstrumentParams = { assetClass: "FUTURE", lotSize: 1, minStep: 10, stepPrice: 7.5, initialMargin: 30_000 };
    const r = calc(RI, { entryPrice: 110_000, stopValue: 1000 });
    // 100 шагов × 7.5 ₽ = 750 ₽ на контракт → 1 контракт на 1000 ₽ риска
    expect(r).toMatchObject({ stopSteps: 100, riskPerLot: 750, lots: 1, positionValue: 82_500 });
  });
});

describe("калькулятор: облигации", () => {
  it("цена в % от номинала", () => {
    const r = calc(OFZ, { entryPrice: 95.5, stopMode: "price", stopValue: 94.5, rewardRatio: 2 });
    expect(r).toMatchObject({ stopSteps: 100, riskPerLot: 10, lots: 100, positionValue: 95_500, takePrice: 97.5 });
  });

  it("валютный номинал → предупреждение", () => {
    const r = calc({ ...OFZ, currency: "USD" }, { entryPrice: 95.5, stopMode: "price", stopValue: 94.5 });
    expect(r.warnings).toContainEqual({ code: "FOREIGN_CURRENCY", currency: "USD" });
  });
});

describe("калькулятор: валидация", () => {
  const errors = (instrument: InstrumentParams, input: Partial<RiskInput>) => {
    const outcome = calculatePosition(instrument, { ...base, ...input });
    return outcome.ok ? {} : outcome.errors;
  };

  it("стоп не с той стороны от входа", () => {
    expect(errors(SBER, { stopMode: "price", stopValue: 310 }).stopValue).toMatch(/ниже цены входа/);
    expect(errors(SBER, { direction: "SHORT", stopMode: "price", stopValue: 290 }).stopValue).toMatch(/выше цены входа/);
  });

  it("стоп в ноль и ниже", () => {
    expect(errors(SBER, { stopMode: "percent", stopValue: 100 }).stopValue).toBeDefined();
  });

  it("пустые и некорректные поля", () => {
    const e = errors(SBER, { depositRub: 0, riskPct: 0, entryPrice: Number.NaN, stopValue: 0, rewardRatio: -1, commissionPct: 10 });
    expect(Object.keys(e).sort()).toEqual(["commissionPct", "depositRub", "entryPrice", "rewardRatio", "riskPct", "stopValue"]);
  });

  it("неполная спецификация инструмента", () => {
    expect(errors({ assetClass: "FUTURE", lotSize: 1, minStep: 1 }, {}).instrument).toMatch(/стоимость шага/);
    expect(errors({ assetClass: "BOND", lotSize: 1, minStep: 0.01 }, {}).instrument).toMatch(/номинал/);
    expect(errors({ assetClass: "SHARE", lotSize: 0, minStep: 0.01 }, {}).instrument).toBeDefined();
  });
});

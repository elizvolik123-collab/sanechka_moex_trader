import { describe, expect, it } from "vitest";
import { buildTrades, pointValue, type FifoExecution } from "./fifo";

const SHARE = { assetClass: "SHARE" as const };
const t = (minutes: number) => new Date(Date.UTC(2026, 9, 1, 7, minutes));

let seq = 0;
function ex(side: "BUY" | "SELL", quantity: number, price: number, minutes: number, fees = 0, accruedInterest?: number): FifoExecution {
  seq += 1;
  return { id: `e${seq}`, side, quantity, price, executedAt: t(minutes), fees, accruedInterest };
}

describe("pointValue", () => {
  it("рублей на 1 пункт цены на 1 штуку", () => {
    expect(pointValue(SHARE).toNumber()).toBe(1);
    expect(pointValue({ assetClass: "BOND", faceValue: 1000 }).toNumber()).toBe(10);
    expect(pointValue({ assetClass: "FUTURE", minStep: 10, stepPrice: 7.5 }).toNumber()).toBe(0.75);
    expect(() => pointValue({ assetClass: "FUTURE" })).toThrow();
  });
});

describe("buildTrades: простые сделки", () => {
  it("лонг: вход и выход одним исполнением", () => {
    const { trades, open } = buildTrades([ex("BUY", 10, 100, 0, 1), ex("SELL", 10, 110, 90, 1.1)], SHARE);
    expect(open).toBeNull();
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      direction: "LONG",
      quantity: 10,
      avgEntry: 100,
      avgExit: 110,
      grossPnl: 100,
      fees: 2.1,
      netPnl: 97.9,
      returnPct: 9.79,
      holdingSec: 90 * 60,
    });
  });

  it("шорт: продажа, затем откуп", () => {
    const { trades } = buildTrades([ex("SELL", 5, 200, 0), ex("BUY", 5, 190, 10)], SHARE);
    expect(trades[0]).toMatchObject({ direction: "SHORT", grossPnl: 50, netPnl: 50, avgEntry: 200, avgExit: 190, returnPct: 5 });
  });

  it("убыточная сделка", () => {
    const { trades } = buildTrades([ex("BUY", 1, 100, 0, 0.5), ex("SELL", 1, 90, 1, 0.5)], SHARE);
    expect(trades[0]).toMatchObject({ grossPnl: -10, netPnl: -11 });
  });

  it("сортирует исполнения по времени", () => {
    const sell = ex("SELL", 1, 110, 5);
    const buy = ex("BUY", 1, 100, 1);
    const { trades } = buildTrades([sell, buy], SHARE);
    expect(trades[0]).toMatchObject({ direction: "LONG", grossPnl: 10 });
  });
});

describe("buildTrades: FIFO и частичное закрытие", () => {
  it("добавление к позиции и закрытие частями — одна сделка, P&L по FIFO", () => {
    const b1 = ex("BUY", 10, 100, 0);
    const b2 = ex("BUY", 10, 110, 1);
    const s1 = ex("SELL", 5, 120, 2);
    const s2 = ex("SELL", 15, 105, 3);
    const { trades, open } = buildTrades([b1, b2, s1, s2], SHARE);
    expect(open).toBeNull();
    expect(trades).toHaveLength(1);
    // FIFO: 5×(120−100) + 5×(105−100) + 10×(105−110) = 100 + 25 − 50
    expect(trades[0]).toMatchObject({ quantity: 20, avgEntry: 105, avgExit: 108.75, grossPnl: 75 });
    expect(trades[0].legs).toEqual([
      { executionId: b1.id, role: "ENTRY", quantity: 10, feeShare: 0 },
      { executionId: b2.id, role: "ENTRY", quantity: 10, feeShare: 0 },
      { executionId: s1.id, role: "EXIT", quantity: 5, feeShare: 0 },
      { executionId: s2.id, role: "EXIT", quantity: 15, feeShare: 0 },
    ]);
  });

  it("незакрытый остаток — открытая позиция, а не сделка", () => {
    const { trades, open } = buildTrades([ex("BUY", 10, 100, 0), ex("BUY", 10, 120, 1), ex("SELL", 12, 130, 2)], SHARE);
    expect(trades).toHaveLength(0);
    // FIFO: первый лот закрыт полностью, от второго осталось 8 шт. по 120
    expect(open).toMatchObject({ direction: "LONG", quantity: 8, avgPrice: 120 });
  });

  it("несколько циклов подряд — несколько сделок", () => {
    const { trades } = buildTrades(
      [ex("BUY", 1, 100, 0), ex("SELL", 1, 101, 1), ex("SELL", 2, 102, 2), ex("BUY", 2, 103, 3)],
      SHARE,
    );
    expect(trades.map((x) => [x.direction, x.grossPnl])).toEqual([
      ["LONG", 1],
      ["SHORT", -2],
    ]);
  });
});

describe("buildTrades: переворот позиции", () => {
  it("закрывает лонг и открывает шорт остатком, комиссия делится пропорционально", () => {
    const b = ex("BUY", 10, 100, 0, 1);
    const s = ex("SELL", 15, 110, 1, 1.5);
    const c = ex("BUY", 5, 100, 2, 0.5);
    const { trades, open } = buildTrades([b, s, c], SHARE);
    expect(open).toBeNull();
    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ direction: "LONG", quantity: 10, grossPnl: 100, fees: 2, netPnl: 98 });
    expect(trades[1]).toMatchObject({ direction: "SHORT", quantity: 5, avgEntry: 110, grossPnl: 50, fees: 1, netPnl: 49 });
    expect(trades[1].firstExecutionId).toBe(s.id);
    expect(trades[0].legs).toContainEqual({ executionId: s.id, role: "EXIT", quantity: 10, feeShare: 1 });
    expect(trades[1].legs).toContainEqual({ executionId: s.id, role: "ENTRY", quantity: 5, feeShare: 0.5 });
  });
});

describe("buildTrades: фьючерсы и облигации", () => {
  it("фьючерс: P&L через стоимость шага", () => {
    const RI = { assetClass: "FUTURE" as const, minStep: 10, stepPrice: 7.5 };
    const { trades } = buildTrades([ex("BUY", 2, 110_000, 0, 4), ex("SELL", 2, 110_500, 30, 4)], RI);
    // 50 шагов × 7.5 ₽ × 2 контракта
    expect(trades[0]).toMatchObject({ grossPnl: 750, netPnl: 742 });
    // стоимость входа: 110 000 / 10 × 7.5 × 2 = 165 000 ₽
    expect(trades[0].returnPct).toBeCloseTo((742 / 165_000) * 100, 6);
  });

  it("облигация: цена в % от номинала плюс разница НКД", () => {
    const OFZ = { assetClass: "BOND" as const, faceValue: 1000 };
    const { trades } = buildTrades([ex("BUY", 10, 95.5, 0, 0, 150), ex("SELL", 10, 96, 60, 0, 200)], OFZ);
    // цена: 0.5% × 1000 ₽ × 10 = 50 ₽; НКД: получили 200, заплатили 150 → +50 ₽
    expect(trades[0].grossPnl).toBe(100);
    expect(trades[0].returnPct).toBeCloseTo((100 / 9550) * 100, 5);
  });
});

describe("buildTrades: валидация", () => {
  it("нулевое количество — ошибка", () => {
    expect(() => buildTrades([ex("BUY", 0, 100, 0)], SHARE)).toThrow(/больше нуля/);
  });

  it("пустой список — нет сделок", () => {
    expect(buildTrades([], SHARE)).toEqual({ trades: [], open: null });
  });
});

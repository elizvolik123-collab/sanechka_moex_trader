import { describe, expect, it } from "vitest";
import { bucketKey, computeStats, equityCurve, maxDrawdown, pnlByPeriod, resolvePeriod, type StatTrade } from "./stats";

// Время закрытия задаём по UTC; МСК = UTC+3
const at = (iso: string) => new Date(iso);
const trade = (netPnl: number, closedAt: string, holdingSec = 600): StatTrade => ({
  netPnl,
  closedAt: at(closedAt),
  openedAt: new Date(at(closedAt).getTime() - holdingSec * 1000),
  holdingSec,
});

const SAMPLE = [
  trade(1000, "2026-10-01T08:00:00Z"),
  trade(-400, "2026-10-01T09:00:00Z"),
  trade(-600, "2026-10-02T08:00:00Z"),
  trade(1500, "2026-10-05T08:00:00Z"),
  trade(0, "2026-10-06T08:00:00Z"),
];

describe("computeStats", () => {
  it("базовые метрики", () => {
    const s = computeStats(SAMPLE, 100_000);
    expect(s).toMatchObject({
      count: 5,
      wins: 2,
      losses: 2,
      breakeven: 1,
      winRatePct: 40,
      lossRatePct: 40,
      totalPnl: 1500,
      grossProfit: 2500,
      grossLoss: 1000,
      avgWin: 1250,
      avgLoss: -500,
      profitFactor: 2.5,
      expectancy: 300,
      bestTrade: 1500,
      worstTrade: -600,
      avgHoldingSec: 600,
    });
  });

  it("максимальная просадка: пик 101 000 → минимум 100 000", () => {
    const s = computeStats(SAMPLE, 100_000);
    expect(s.maxDrawdownRub).toBe(1000);
    expect(s.maxDrawdownPct).toBeCloseTo(0.99, 2);
  });

  it("без начального капитала — просадка только в рублях", () => {
    const s = computeStats(SAMPLE, null);
    expect(s.maxDrawdownRub).toBe(1000);
    expect(s.maxDrawdownPct).toBeNull();
  });

  it("нет убыточных сделок → profit factor не определён", () => {
    expect(computeStats([trade(100, "2026-10-01T08:00:00Z")]).profitFactor).toBeNull();
  });

  it("пустой список", () => {
    expect(computeStats([])).toMatchObject({ count: 0, winRatePct: 0, totalPnl: 0, expectancy: 0, maxDrawdownRub: 0 });
  });

  it("без ошибок округления float", () => {
    const s = computeStats([trade(0.1, "2026-10-01T08:00:00Z"), trade(0.2, "2026-10-01T09:00:00Z")]);
    expect(s.totalPnl).toBe(0.3);
  });
});

describe("equityCurve / maxDrawdown", () => {
  it("кривая капитала по времени закрытия, с начальной точкой", () => {
    const curve = equityCurve([SAMPLE[1], SAMPLE[0]], 10_000);
    expect(curve.map((p) => p.equity)).toEqual([10_000, 11_000, 10_600]);
  });

  it("просадка считается от последнего пика", () => {
    const curve = [100, 120, 90, 130, 100, 140].map((equity, i) => ({ time: new Date(i), equity, pnl: 0 }));
    expect(maxDrawdown(curve, true)).toEqual({ amount: 30, pct: 25 });
  });
});

describe("группировка по периодам (МСК)", () => {
  it("сделка в 22:30 UTC относится к следующему дню по Москве", () => {
    expect(bucketKey(at("2026-10-01T22:30:00Z"), "day")).toBe("2026-10-02");
    expect(bucketKey(at("2026-10-01T20:30:00Z"), "day")).toBe("2026-10-01");
  });

  it("неделя начинается в понедельник", () => {
    // 4 октября 2026 — воскресенье, 5-е — понедельник
    expect(bucketKey(at("2026-10-04T10:00:00Z"), "week")).toBe("2026-09-28");
    expect(bucketKey(at("2026-10-05T10:00:00Z"), "week")).toBe("2026-10-05");
  });

  it("P&L по дням и месяцам", () => {
    expect(pnlByPeriod(SAMPLE, "day")).toEqual([
      { period: "2026-10-01", pnl: 600, count: 2 },
      { period: "2026-10-02", pnl: -600, count: 1 },
      { period: "2026-10-05", pnl: 1500, count: 1 },
      { period: "2026-10-06", pnl: 0, count: 1 },
    ]);
    expect(pnlByPeriod(SAMPLE, "month")).toEqual([{ period: "2026-10", pnl: 1500, count: 5 }]);
  });
});

describe("resolvePeriod", () => {
  // 23 октября 2026, 02:00 МСК (= 22 октября 23:00 UTC), пятница
  const now = at("2026-10-22T23:00:00Z");

  it("день, неделя, месяц, год — начало по Москве", () => {
    expect(resolvePeriod("day", now).from?.toISOString()).toBe("2026-10-22T21:00:00.000Z");
    expect(resolvePeriod("week", now).from?.toISOString()).toBe("2026-10-18T21:00:00.000Z");
    expect(resolvePeriod("month", now).from?.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(resolvePeriod("year", now).from?.toISOString()).toBe("2025-12-31T21:00:00.000Z");
    expect(resolvePeriod("all", now)).toEqual({ from: null, to: null });
  });

  it("произвольный диапазон включает последний день целиком", () => {
    const r = resolvePeriod("custom", now, { from: "2026-10-01", to: "2026-10-05" });
    expect(r.from?.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(r.to?.toISOString()).toBe("2026-10-05T21:00:00.000Z");
  });

  it("некорректные даты игнорируются", () => {
    expect(resolvePeriod("custom", now, { from: "01.10.2026", to: "" })).toEqual({ from: null, to: null });
  });
});

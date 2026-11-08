import { describe, expect, it } from "vitest";
import { pnlByKey } from "@/core/stats";
import { csvNumber, toCsv } from "./csv";
import { calendarLayout, divergingLevel, magnitudeThresholds } from "./heatmap";

describe("pnlByKey", () => {
  const t = (key: string, netPnl: number) => ({ key, netPnl, openedAt: new Date(0), closedAt: new Date(0), holdingSec: 0 });
  it("суммирует по ключу и сортирует от лучшего к худшему", () => {
    const rows = pnlByKey([t("SBER", 100), t("GAZP", -50), t("SBER", -30), t("LKOH", 0.1), t("LKOH", 0.2)], (x) => x.key, (x) => x.key);
    expect(rows).toEqual([
      { key: "SBER", label: "SBER", pnl: 70, count: 2, wins: 1 },
      { key: "LKOH", label: "LKOH", pnl: 0.3, count: 2, wins: 2 },
      { key: "GAZP", label: "GAZP", pnl: -50, count: 1, wins: 0 },
    ]);
  });
});

describe("calendarLayout", () => {
  it("недели с понедельника, дни вне диапазона пустые", () => {
    // 1 октября 2026 — четверг, 4-е — воскресенье
    const { weeks, months } = calendarLayout("2026-10-01", "2026-10-06");
    expect(weeks).toEqual([
      [null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
      ["2026-10-05", "2026-10-06", null, null, null, null, null],
    ]);
    expect(months).toEqual([{ week: 0, label: "окт" }]);
  });

  it("подпись месяца над первой неделей нового месяца", () => {
    const { months } = calendarLayout("2026-09-20", "2026-10-20");
    expect(months.map((m) => m.label)).toEqual(["сен", "окт"]);
  });

  it("ограничивает длинный диапазон последними неделями", () => {
    expect(calendarLayout("2020-01-01", "2026-10-20", 53).weeks.length).toBeLessThanOrEqual(54);
  });
});

describe("шкала тепловой карты", () => {
  it("пороги — терцили модулей, ноль не учитывается", () => {
    expect(magnitudeThresholds([0, 100, -200, 300, -400, 500, 600])).toEqual([300, 500]);
    expect(magnitudeThresholds([])).toEqual([0, 0]);
  });

  it("уровень: знак и сила", () => {
    const t: [number, number] = [100, 500];
    expect(divergingLevel(0, t)).toBe(0);
    expect(divergingLevel(50, t)).toBe(1);
    expect(divergingLevel(-300, t)).toBe(-2);
    expect(divergingLevel(9000, t)).toBe(3);
  });
});

describe("CSV", () => {
  it("BOM, «;», десятичная запятая, экранирование", () => {
    const csv = toCsv(["Тикер", "Заметка", "P&L"], [["SBER", 'пробой "уровня"; стоп', 1234.5], ["GAZP", null, -10]]);
    expect(csv).toBe('﻿Тикер;Заметка;P&L\r\nSBER;"пробой ""уровня""; стоп";1234,5\r\nGAZP;;-10\r\n');
  });

  it("числа без хвостов погрешности", () => {
    expect(csvNumber(0.1 + 0.2)).toBe("0,3");
    expect(csvNumber(Number.NaN)).toBe("");
  });
});

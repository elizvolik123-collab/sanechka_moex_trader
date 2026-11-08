import { describe, expect, it } from "vitest";
import { formatPrice, parseNumber, toInputString } from "./number";

describe("parseNumber", () => {
  it("понимает пробелы и запятую", () => {
    expect(parseNumber("1 234,5")).toBe(1234.5);
    expect(parseNumber("100 000")).toBe(100000);
    expect(parseNumber("0.25")).toBe(0.25);
  });

  it("некорректный ввод → NaN", () => {
    expect(parseNumber("")).toBeNaN();
    expect(parseNumber("12a")).toBeNaN();
    expect(parseNumber("1,2,3")).toBeNaN();
  });
});

describe("форматирование", () => {
  it("цена с точностью инструмента", () => {
    expect(formatPrice(95000, 0).replace(/\s/g, " ")).toBe("95 000");
    expect(formatPrice(301.2, 2)).toBe("301,20");
  });

  it("строка для поля ввода без хвоста погрешности", () => {
    expect(toInputString(0.1 + 0.2)).toBe("0,3");
    expect(toInputString(Number.NaN)).toBe("");
  });
});

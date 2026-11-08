import { describe, expect, it } from "vitest";
import { decodeText, parseCsv } from "./csv";
import { detectTable, guessMapping, mappingErrors, normalizeRows } from "./mapping";
import { hashString, parseDateTime, parseDecimalCell, parseSide } from "./values";

describe("parseDecimalCell", () => {
  it.each([
    ["1 234,56", 1234.56],
    ["1234.56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["-12,5 ₽", -12.5],
    ["(100)", -100],
    ["0", 0],
    ["10 руб.", 10],
  ])("%s → %d", (raw, expected) => {
    expect(parseDecimalCell(raw)).toBe(expected);
  });

  it.each(["", "  ", "abc", "1,2,3", null, undefined])("%s → null", (raw) => {
    expect(parseDecimalCell(raw)).toBeNull();
  });
});

describe("parseSide", () => {
  it.each(["Покупка", "покупка ЦБ", "Купля", "BUY", "b", "К"])("%s → BUY", (raw) => expect(parseSide(raw)).toBe("BUY"));
  it.each(["Продажа", "SELL", "s", "П", "Продажа ценных бумаг"])("%s → SELL", (raw) => expect(parseSide(raw)).toBe("SELL"));
  it.each(["", "Перевод", "дивиденд"])("%s → null", (raw) => expect(parseSide(raw)).toBeNull());
});

describe("parseDateTime", () => {
  it("русский формат, время по Москве", () => {
    expect(parseDateTime("01.10.2026 10:15:30")?.toISOString()).toBe("2026-10-01T07:15:30.000Z");
    expect(parseDateTime("1.10.2026")?.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });

  it("время в отдельной колонке", () => {
    expect(parseDateTime("01.10.2026", "18:45")?.toISOString()).toBe("2026-10-01T15:45:00.000Z");
  });

  it("ISO с часовым поясом и без", () => {
    expect(parseDateTime("2026-10-01 10:00:00")?.toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(parseDateTime("2026-10-01T10:00:00Z")?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(parseDateTime("2026-10-01T10:00:00.123+0500")?.toISOString()).toBe("2026-10-01T05:00:00.000Z");
  });

  it("некорректные даты", () => {
    expect(parseDateTime("31.02.2026")).toBeNull();
    expect(parseDateTime("2026-13-01")).toBeNull();
    expect(parseDateTime("01.10.2026 25:00")).toBeNull();
    expect(parseDateTime("вчера")).toBeNull();
  });
});

describe("hashString", () => {
  it("стабилен и различает строки", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
  });
});

// Отчёт в стиле российского брокера: заголовок документа, точка с запятой, запятая в дробях, строка «Итого»
const REPORT = [
  "Отчёт о сделках;;;;;;;",
  "Клиент: Иванов И.И.;;;;;;;",
  ";;;;;;;",
  "Номер сделки;Дата заключения;Время;Код актива;Вид сделки;Количество;Цена за единицу;Комиссия брокера;Комиссия биржи",
  "1001;01.10.2026;10:00:00;SBER;Покупка;100;300,50;15,03;0,3",
  "1002;01.10.2026;15:30:00;SBER;Продажа;100;305,10;15,26;0,31",
  "1003;02.10.2026;11:00:00;GAZP;Продажа;50;120;3;",
  "1004;02.10.2026;;GAZP;Перевод;50;120;3;",
  "Итого;;;;;;;33,29;0,61",
].join("\r\n");

describe("CSV брокерского отчёта", () => {
  const table = detectTable(parseCsv(REPORT));

  it("находит строку заголовков после шапки документа", () => {
    expect(table.headerRowIndex).toBe(3);
    expect(table.headers[1]).toBe("Дата заключения");
    expect(table.rows).toHaveLength(5);
  });

  it("автоматически сопоставляет колонки", () => {
    expect(guessMapping(table.headers)).toEqual({
      tradeId: 0,
      date: 1,
      time: 2,
      ticker: 3,
      side: 4,
      quantity: 5,
      price: 6,
      brokerFee: 7,
      exchangeFee: 8,
    });
  });

  it("нормализует строки, сообщает об ошибках, пропускает «Итого»", () => {
    const { rows, errors } = normalizeRows(table, guessMapping(table.headers));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      rowNumber: 5,
      externalId: "id:1001",
      ticker: "SBER",
      side: "BUY",
      quantity: 100,
      price: 300.5,
      brokerFee: 15.03,
      exchangeFee: 0.3,
      accruedInterest: null,
    });
    expect(rows[0].executedAt.toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(rows[2]).toMatchObject({ side: "SELL", exchangeFee: 0 });
    expect(errors).toEqual([{ rowNumber: 8, message: "не распознано направление «Перевод»" }]);
  });

  it("без номера сделки id строится из содержимого и стабилен между импортами", () => {
    const mapping = { ...guessMapping(table.headers), tradeId: undefined };
    const first = normalizeRows(table, mapping).rows.map((r) => r.externalId);
    const second = normalizeRows(table, mapping).rows.map((r) => r.externalId);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(3);
    expect(first[0]).toMatch(/^row:/);
  });

  it("одинаковые строки внутри файла получают разные id", () => {
    const dup = detectTable(
      parseCsv("Дата;Тикер;Направление;Количество;Цена\n01.10.2026 10:00;SBER;Покупка;1;300\n01.10.2026 10:00;SBER;Покупка;1;300"),
    );
    const ids = normalizeRows(dup, guessMapping(dup.headers)).rows.map((r) => r.externalId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("проверяет обязательные колонки", () => {
    expect(mappingErrors({ date: 0 })).toEqual([
      "Не выбрана колонка «Направление (покупка/продажа)»",
      "Не выбрана колонка «Количество»",
      "Не выбрана колонка «Цена»",
      "Нужна колонка «Тикер» или «ISIN»",
    ]);
    expect(mappingErrors(guessMapping(table.headers))).toEqual([]);
  });
});

describe("decodeText", () => {
  it("UTF-8 и Windows-1251", () => {
    expect(decodeText(new TextEncoder().encode("Покупка"))).toBe("Покупка");
    // «Покупка» в Windows-1251
    const cp1251 = new Uint8Array([0xcf, 0xee, 0xea, 0xf3, 0xef, 0xea, 0xe0]);
    expect(decodeText(cp1251)).toBe("Покупка");
  });
});

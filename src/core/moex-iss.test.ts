import { describe, expect, it } from "vitest";
import { boardConfig, parseMarketdataRow, parseSecurityRow, tableToRows } from "./moex-iss";

// Образцы в формате ответа ISS (сокращённый набор колонок)
const shares = {
  columns: ["SECID", "BOARDID", "SHORTNAME", "PREVPRICE", "LOTSIZE", "DECIMALS", "SECNAME", "MINSTEP", "PREVDATE", "ISIN", "CURRENCYID"],
  data: [
    ["SBER", "TQBR", "Сбербанк", 301.25, 10, 2, "Сбербанк России ПАО ао", 0.01, "2026-10-22", "RU0009029540", "SUR"],
    ["BROKEN", "TQBR", "Без шага", 1, 1, 2, "Без шага", null, "2026-10-22", null, "SUR"],
  ],
};

const futures = {
  columns: ["SECID", "SHORTNAME", "SECNAME", "PREVSETTLEPRICE", "DECIMALS", "MINSTEP", "LASTTRADEDATE", "STEPPRICE", "INITIALMARGIN", "LOTVOLUME"],
  data: [["SiZ6", "Si-12.26", "Фьючерсный контракт Si-12.26", 97500, 0, 1, "2026-12-17", 1, 14850.5, 1000]],
};

const bonds = {
  columns: ["SECID", "SHORTNAME", "PREVPRICE", "LOTSIZE", "FACEVALUE", "MATDATE", "DECIMALS", "SECNAME", "MINSTEP", "FACEUNIT", "ISIN", "PREVDATE"],
  data: [
    ["SU26238RMFS4", "ОФЗ 26238", 58.912, 1, 1000, "2041-05-15", 3, "ОФЗ-ПД 26238 15/05/2041", 0.001, "SUR", "RU000A1038V6", "2026-10-22"],
    ["XS0000000000", "Бессрочная", 95.1, 1, 1000, "0000-00-00", 2, "Бессрочная облигация", 0.01, "USD", null, "2026-10-22"],
  ],
};

describe("moex-iss: таблицы ISS", () => {
  it("превращает columns/data в объекты", () => {
    const rows = tableToRows(shares);
    expect(rows).toHaveLength(2);
    expect(rows[0].SECID).toBe("SBER");
    expect(rows[0].LOTSIZE).toBe(10);
  });

  it("устойчив к отсутствующему блоку", () => {
    expect(tableToRows(undefined)).toEqual([]);
  });
});

describe("moex-iss: спецификации", () => {
  it("акция: лотность, шаг, рубли, цена закрытия", () => {
    const spec = parseSecurityRow(tableToRows(shares)[0], boardConfig("TQBR")!);
    expect(spec).toMatchObject({
      secid: "SBER",
      assetClass: "SHARE",
      lotSize: 10,
      minStep: 0.01,
      currency: "RUB",
      prevPrice: 301.25,
      isin: "RU0009029540",
    });
    expect(spec?.prevPriceDate?.toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });

  it("пропускает строки без шага цены", () => {
    expect(parseSecurityRow(tableToRows(shares)[1], boardConfig("TQBR")!)).toBeNull();
  });

  it("фьючерс: стоимость шага, ГО, экспирация, лот = 1 контракт", () => {
    const spec = parseSecurityRow(tableToRows(futures)[0], boardConfig("RFUD")!);
    expect(spec).toMatchObject({
      secid: "SiZ6",
      assetClass: "FUTURE",
      lotSize: 1,
      minStep: 1,
      stepPrice: 1,
      initialMargin: 14850.5,
      prevPrice: 97500,
      decimals: 0,
    });
    expect(spec?.expiresAt?.toISOString().slice(0, 10)).toBe("2026-12-17");
  });

  it("облигация: номинал, погашение, валюта номинала, пустая дата 0000-00-00", () => {
    const [ofz, perpetual] = tableToRows(bonds).map((r) => parseSecurityRow(r, boardConfig("TQOB")!));
    expect(ofz).toMatchObject({ assetClass: "BOND", faceValue: 1000, minStep: 0.001, currency: "RUB", prevPrice: 58.912 });
    expect(ofz?.expiresAt?.toISOString().slice(0, 10)).toBe("2041-05-15");
    expect(perpetual?.expiresAt).toBeNull();
    expect(perpetual?.currency).toBe("USD");
  });
});

describe("moex-iss: котировки", () => {
  it("собирает время котировки по Москве", () => {
    const q = parseMarketdataRow({ SECID: "SBER", LAST: 302.1, UPDATETIME: "14:35:07", SYSTIME: "2026-10-23 14:50:12" });
    expect(q).toEqual({ secid: "SBER", last: 302.1, updatedAt: "2026-10-23T14:35:07+03:00" });
    expect(new Date(q!.updatedAt!).toISOString()).toBe("2026-10-23T11:35:07.000Z");
  });

  it("без сделок: берёт рыночную цену, а нулевая цена — это отсутствие котировки", () => {
    expect(parseMarketdataRow({ SECID: "X", LAST: null, MARKETPRICE: 10.5 })?.last).toBe(10.5);
    expect(parseMarketdataRow({ SECID: "X", LAST: 0 })?.last).toBeNull();
  });
});

/**
 * Небольшой справочник инструментов для ЛОКАЛЬНОЙ разработки без доступа к MOEX ISS
 * (ISS не отвечает зарубежным IP). Значения ГО и стоимости шага приблизительные, цен закрытия нет.
 * На сервере справочник загружается из ISS (pnpm moex:sync / воркер) и перезаписывает эти записи.
 *
 * Запуск: pnpm db:seed:dev
 */
import "dotenv/config";
import type { InstrumentSpec } from "@/core/moex-iss";
import { db } from "@/server/db";

if (process.env.NODE_ENV === "production") {
  console.error("Dev-сид нельзя запускать в продакшене");
  process.exit(1);
}

const base = { isin: null, prevPrice: null, prevPriceDate: null, stepPrice: null, faceValue: null, initialMargin: null, expiresAt: null };

const FIXTURES: InstrumentSpec[] = [
  { ...base, secid: "SBER", board: "TQBR", assetClass: "SHARE", shortName: "Сбербанк", name: "Сбербанк России ПАО ао", currency: "RUB", lotSize: 10, minStep: 0.01, decimals: 2 },
  { ...base, secid: "SBERP", board: "TQBR", assetClass: "SHARE", shortName: "Сбербанк-п", name: "Сбербанк России ПАО ап", currency: "RUB", lotSize: 10, minStep: 0.01, decimals: 2 },
  { ...base, secid: "GAZP", board: "TQBR", assetClass: "SHARE", shortName: "ГАЗПРОМ ао", name: "\"Газпром\" (ПАО) ао", currency: "RUB", lotSize: 10, minStep: 0.01, decimals: 2 },
  { ...base, secid: "LKOH", board: "TQBR", assetClass: "SHARE", shortName: "ЛУКОЙЛ", name: "НК ЛУКОЙЛ (ПАО) - ао", currency: "RUB", lotSize: 1, minStep: 0.5, decimals: 1 },
  { ...base, secid: "YDEX", board: "TQBR", assetClass: "SHARE", shortName: "Яндекс", name: "МКПАО \"Яндекс\" ао", currency: "RUB", lotSize: 1, minStep: 0.5, decimals: 1 },
  { ...base, secid: "TMOS", board: "TQTF", assetClass: "ETF", shortName: "TMOS ETF", name: "БПИФ Т-Капитал Индекс МосБиржи", currency: "RUB", lotSize: 1, minStep: 0.01, decimals: 2 },
  { ...base, secid: "SiZ6", board: "RFUD", assetClass: "FUTURE", shortName: "Si-12.26", name: "Фьючерсный контракт Si-12.26", currency: "RUB", lotSize: 1, minStep: 1, decimals: 0, stepPrice: 1, initialMargin: 15000, expiresAt: new Date("2026-12-17T00:00:00Z") },
  { ...base, secid: "RIZ6", board: "RFUD", assetClass: "FUTURE", shortName: "RTS-12.26", name: "Фьючерсный контракт RTS-12.26", currency: "RUB", lotSize: 1, minStep: 10, decimals: 0, stepPrice: 15, initialMargin: 30000, expiresAt: new Date("2026-12-17T00:00:00Z") },
  { ...base, secid: "CRZ6", board: "RFUD", assetClass: "FUTURE", shortName: "CNY-12.26", name: "Фьючерсный контракт CNY-12.26", currency: "RUB", lotSize: 1, minStep: 0.001, decimals: 3, stepPrice: 1, initialMargin: 1500, expiresAt: new Date("2026-12-17T00:00:00Z") },
  { ...base, secid: "SU26238RMFS4", board: "TQOB", assetClass: "BOND", shortName: "ОФЗ 26238", name: "ОФЗ-ПД 26238 15/05/2041", currency: "RUB", lotSize: 1, minStep: 0.001, decimals: 3, faceValue: 1000, expiresAt: new Date("2041-05-15T00:00:00Z") },
  { ...base, secid: "CNYRUB_TOM", board: "CETS", assetClass: "CURRENCY", shortName: "CNYRUB_TOM", name: "Юань / рубль (расчёты завтра)", currency: "RUB", lotSize: 1, minStep: 0.0005, decimals: 4 },
];

async function main() {
  for (const { secid, board, ...data } of FIXTURES) {
    await db().instrument.upsert({
      where: { secid_board: { secid, board } },
      create: { secid, board, ...data },
      update: data,
    });
  }
  console.log(`Dev-справочник: ${FIXTURES.length} инструментов`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

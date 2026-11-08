import type { BrokerAdapter, BrokerInstrumentRef } from "../brokers/types";
import { db } from "../db";
import { logger } from "../logger";

export type ResolvedInstrument = {
  id: string;
  secid: string;
  assetClass: string;
  lotSize: number;
  faceValue: number | null;
  logoName: string | null;
};

const select = { id: true, secid: true, assetClass: true, lotSize: true, faceValue: true, stepPrice: true, logoName: true } as const;

type Row = { id: string; secid: string; assetClass: string; lotSize: number; faceValue: { toNumber(): number } | null; stepPrice: unknown; logoName: string | null };

const toResolved = (r: Row): ResolvedInstrument => ({
  id: r.id,
  secid: r.secid,
  assetClass: r.assetClass,
  lotSize: r.lotSize,
  faceValue: r.faceValue?.toNumber() ?? null,
  logoName: r.logoName,
});

/** Спецификация достаточна для расчёта P&L: облигациям нужен номинал, фьючерсам — стоимость шага. */
const isComplete = (r: Row) => (r.assetClass !== "BOND" || r.faceValue !== null) && (r.assetClass !== "FUTURE" || r.stepPrice !== null);

/**
 * Сопоставляет инструменты брокера со справочником MOEX.
 * Порядок: уже связанный (uid/FIGI) → по тикеру и режиму торгов или ISIN → создать новый из данных брокера.
 * Результаты кэшируются на время одной синхронизации.
 */
export class InstrumentResolver {
  private cache = new Map<string, Promise<ResolvedInstrument | null>>();

  constructor(private readonly adapter: BrokerAdapter) {}

  resolve(ref: BrokerInstrumentRef): Promise<ResolvedInstrument | null> {
    const key = ref.uid ?? ref.figi ?? `${ref.ticker}:${ref.classCode}`;
    let pending = this.cache.get(key);
    if (!pending) {
      pending = this.lookup(ref);
      this.cache.set(key, pending);
    }
    return pending;
  }

  private async lookup(ref: BrokerInstrumentRef): Promise<ResolvedInstrument | null> {
    const linked = await db().instrument.findFirst({
      where: { OR: [...(ref.uid ? [{ tinvestUid: ref.uid }] : []), ...(ref.figi ? [{ figi: ref.figi }] : [])] },
      select,
    });
    if (linked && isComplete(linked)) return toResolved(linked);

    const info = await this.adapter.getInstrument(ref);
    if (!info) {
      logger.warn({ ref }, "Инструмент брокера не найден");
      return linked ? toResolved(linked) : null;
    }

    const existing =
      linked ??
      (await db().instrument.findFirst({
        where: {
          OR: [
            { secid: { equals: info.ticker, mode: "insensitive" }, board: info.board },
            ...(info.isin ? [{ isin: info.isin, board: info.board }] : []),
          ],
        },
        select,
      }));

    if (existing) {
      // Связываем с брокером и дополняем то, чего нет в данных биржи; рыночные параметры MOEX не перетираем
      const updated = await db().instrument.update({
        where: { id: existing.id },
        data: {
          tinvestUid: info.uid,
          figi: info.figi,
          logoName: info.logoName ?? undefined,
          ...(existing.faceValue === null && info.faceValue ? { faceValue: info.faceValue } : {}),
          ...(existing.stepPrice === null && info.stepPrice ? { stepPrice: info.stepPrice } : {}),
        },
        select,
      });
      return toResolved(updated);
    }

    // Инструмента нет в справочнике (например, справочник ещё не загружен) — создаём из данных брокера
    const created = await db().instrument.create({
      data: {
        secid: info.ticker,
        board: info.board,
        assetClass: info.assetClass,
        shortName: info.name,
        name: info.name,
        isin: info.isin,
        figi: info.figi,
        tinvestUid: info.uid,
        currency: info.currency,
        lotSize: info.lotSize,
        minStep: info.minStep > 0 ? info.minStep : 0.01,
        stepPrice: info.stepPrice,
        faceValue: info.faceValue,
        initialMargin: info.initialMargin,
        logoName: info.logoName,
      },
      select,
    });
    return toResolved(created);
  }
}

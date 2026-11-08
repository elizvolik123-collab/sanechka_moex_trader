import { createHash } from "node:crypto";
import { format } from "date-fns";
import { buildTrades } from "@/core/fifo";
import { MSK } from "@/core/stats";
import { db } from "../db";
import { logger } from "../logger";

/** Детерминированный id сделки: при пересборке сделка сохраняет id, если не изменилось её первое исполнение. */
function tradeId(accountId: string, instrumentId: string, firstExecutionId: string) {
  return `t_${createHash("sha256").update(`${accountId}|${instrumentId}|${firstExecutionId}`).digest("hex").slice(0, 24)}`;
}

export type RebuildResult = { trades: number; failed: { instrumentId: string; secid: string; message: string }[] };

/**
 * Пересобирает сделки по счёту для указанных инструментов из всех исполнений (FIFO).
 * Сделки производные: старые удаляются и создаются заново в одной транзакции.
 */
export async function rebuildTrades(accountId: string, instrumentIds: Iterable<string>): Promise<RebuildResult> {
  const result: RebuildResult = { trades: 0, failed: [] };

  for (const instrumentId of new Set(instrumentIds)) {
    const instrument = await db().instrument.findUniqueOrThrow({ where: { id: instrumentId } });
    const executions = await db().execution.findMany({
      where: { accountId, instrumentId },
      orderBy: [{ executedAt: "asc" }, { id: "asc" }],
    });

    let built;
    try {
      built = buildTrades(
        executions.map((e) => ({
          id: e.id,
          side: e.side,
          executedAt: e.executedAt,
          price: e.price.toNumber(),
          quantity: e.quantity.toNumber(),
          fees: e.brokerFee.add(e.exchangeFee).toNumber(),
          accruedInterest: e.accruedInterest?.toNumber() ?? null,
        })),
        {
          assetClass: instrument.assetClass,
          minStep: instrument.minStep.toNumber(),
          stepPrice: instrument.stepPrice?.toNumber(),
          faceValue: instrument.faceValue?.toNumber(),
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ accountId, instrumentId, err: error }, "Не удалось собрать сделки");
      result.failed.push({ instrumentId, secid: instrument.secid, message });
      continue;
    }

    const trades = built.trades.map((t) => ({
      id: tradeId(accountId, instrumentId, t.firstExecutionId),
      accountId,
      instrumentId,
      direction: t.direction,
      openedAt: t.openedAt,
      closedAt: t.closedAt,
      closedDateMsk: new Date(`${format(t.closedAt, "yyyy-MM-dd", { in: MSK })}T00:00:00Z`),
      quantity: t.quantity,
      lots: t.quantity / instrument.lotSize,
      avgEntry: t.avgEntry,
      avgExit: t.avgExit,
      fees: t.fees,
      grossPnl: t.grossPnl,
      netPnl: t.netPnl,
      returnPct: t.returnPct,
      holdingSec: t.holdingSec,
    }));
    const legs = built.trades.flatMap((t) =>
      t.legs.map((l) => ({
        tradeId: tradeId(accountId, instrumentId, t.firstExecutionId),
        executionId: l.executionId,
        role: l.role,
        quantity: l.quantity,
        feeShare: l.feeShare,
      })),
    );

    await db().$transaction(async (tx) => {
      await tx.trade.deleteMany({ where: { accountId, instrumentId } });
      if (trades.length) await tx.trade.createMany({ data: trades });
      if (legs.length) await tx.tradeLeg.createMany({ data: legs });
    });
    result.trades += trades.length;
  }
  return result;
}

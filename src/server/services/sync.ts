import Decimal from "decimal.js";
import type { Prisma } from "@/generated/prisma/client";
import { createBrokerAdapter } from "../brokers";
import { BrokerAuthError, BrokerUnavailableError, type BrokerAdapter, type BrokerInstrumentRef } from "../brokers/types";
import { db } from "../db";
import type { BrokerSyncJob } from "../jobs/queues";
import { logger } from "../logger";
import { decryptToken } from "../secrets";
import { InstrumentResolver, type ResolvedInstrument } from "./broker-instruments";
import { rebuildTrades } from "./trades-rebuild";

/** С какой даты грузить историю, если брокер не сообщил дату открытия счёта. */
const HISTORY_START = new Date("2015-01-01T00:00:00Z");
/** Перекрытие инкрементальной синхронизации: поздние комиссии и операции задним числом. */
const OVERLAP_MS = 3 * 24 * 3600_000;

export type SyncStats = {
  accounts: number;
  executions: number;
  cashOps: number;
  trades: number;
  skipped: Record<string, number>;
};

/**
 * Синхронизация брокерского подключения (в воркере). Первичная — вся история, инкрементальная — с даты
 * последней синхронизации с перекрытием. Дубли исключены уникальным externalId, поэтому повтор безопасен.
 */
export async function runBrokerSync(job: BrokerSyncJob): Promise<void> {
  const connection = await db().brokerConnection.findUnique({
    where: { id: job.connectionId },
    select: { id: true, broker: true, tokenCipher: true },
  });
  if (!connection) {
    logger.info({ connectionId: job.connectionId }, "Подключение удалено — синхронизация пропущена");
    return;
  }
  if (connection.broker === "FILE" || !connection.tokenCipher) return;

  const run = await db().syncRun.create({
    data: { connectionId: connection.id, kind: job.kind, status: "RUNNING" },
    select: { id: true },
  });

  try {
    const adapter = createBrokerAdapter(connection.broker, decryptToken(connection.tokenCipher));
    const stats = await syncConnection(connection.id, adapter, job.kind);
    await db().$transaction([
      db().syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), stats: stats as unknown as Prisma.InputJsonValue },
      }),
      db().brokerConnection.update({
        where: { id: connection.id },
        data: { status: "ACTIVE", lastSyncAt: new Date(), lastSyncError: null },
      }),
    ]);
    logger.info({ connectionId: connection.id, ...stats }, "Синхронизация завершена");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db().$transaction([
      db().syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), error: message } }),
      db().brokerConnection.update({
        where: { id: connection.id },
        data: { lastSyncError: message, status: error instanceof BrokerAuthError ? "REVOKED" : "ERROR" },
      }),
    ]);
    logger.warn({ connectionId: connection.id, err: error }, "Синхронизация завершилась ошибкой");
    // Временные сбои повторит pg-boss; ошибку токена повторять бессмысленно
    if (error instanceof BrokerUnavailableError) throw error;
  }
}

export async function syncConnection(connectionId: string, adapter: BrokerAdapter, kind: BrokerSyncJob["kind"]): Promise<SyncStats> {
  const stats: SyncStats = { accounts: 0, executions: 0, cashOps: 0, trades: 0, skipped: {} };
  const addSkipped = (reason: string, n = 1) => (stats.skipped[reason] = (stats.skipped[reason] ?? 0) + n);

  const remoteAccounts = await adapter.listAccounts();
  for (const a of remoteAccounts) {
    await db().brokerAccount.upsert({
      where: { connectionId_externalId: { connectionId, externalId: a.externalId } },
      create: { connectionId, externalId: a.externalId, name: a.name },
      update: { name: a.name },
    });
  }
  stats.accounts = remoteAccounts.length;

  const accounts = await db().brokerAccount.findMany({
    where: { connectionId, isEnabled: true },
    select: { id: true, externalId: true, syncedUntil: true },
  });
  const resolver = new InstrumentResolver(adapter);
  const openedAt = new Map(remoteAccounts.map((a) => [a.externalId, a.openedAt]));

  for (const account of accounts) {
    if (!openedAt.has(account.externalId)) continue; // счёт больше не виден токену
    const to = new Date();
    const from =
      kind === "FULL" || !account.syncedUntil
        ? (openedAt.get(account.externalId) ?? HISTORY_START)
        : new Date(account.syncedUntil.getTime() - OVERLAP_MS);

    const batch = await adapter.fetchOperations(account.externalId, from, to);
    for (const [reason, n] of Object.entries(batch.skipped)) addSkipped(reason, n);

    const resolveRef = async (ref: BrokerInstrumentRef) => {
      const r = await resolver.resolve(ref);
      if (!r) addSkipped("инструмент не найден у брокера");
      return r;
    };

    // Исполнения
    const executions: Prisma.ExecutionCreateManyInput[] = [];
    for (const e of batch.executions) {
      const instrument = await resolveRef(e.instrument);
      if (!instrument) continue;
      executions.push({
        accountId: account.id,
        instrumentId: instrument.id,
        externalId: e.externalId,
        side: e.side,
        executedAt: e.executedAt,
        price: storedPrice(e.price, instrument),
        quantity: e.quantity,
        lots: new Decimal(e.quantity).div(instrument.lotSize).toNumber(),
        accruedInterest: e.accruedInterest,
        brokerFee: e.brokerFee,
        exchangeFee: 0,
        currency: e.currency,
      });
    }
    const inserted = executions.length
      ? (await db().execution.createMany({ data: executions, skipDuplicates: true })).count
      : 0;
    stats.executions += inserted;

    // Комиссия могла прийти позже самой сделки (следующая синхронизация с перекрытием) — обновляем
    let feesUpdated = 0;
    for (const e of executions) {
      if (!e.brokerFee || Number(e.brokerFee) === 0) continue;
      const { count } = await db().execution.updateMany({
        where: { accountId: account.id, externalId: e.externalId, NOT: { brokerFee: e.brokerFee } },
        data: { brokerFee: e.brokerFee },
      });
      feesUpdated += count;
    }

    // Денежные операции
    const cashOps: Prisma.CashOperationCreateManyInput[] = [];
    for (const c of batch.cashOps) {
      const instrument = c.instrument ? await resolver.resolve(c.instrument) : null;
      cashOps.push({
        accountId: account.id,
        instrumentId: instrument?.id ?? null,
        externalId: c.externalId,
        type: c.type,
        // TODO: пересчёт валютных операций по курсу ЦБ; пока сумма хранится в валюте операции
        amountRub: c.amount,
        currency: c.currency,
        occurredAt: c.occurredAt,
        description: c.description,
      });
    }
    if (cashOps.length) stats.cashOps += (await db().cashOperation.createMany({ data: cashOps, skipDuplicates: true })).count;

    if (inserted > 0 || feesUpdated > 0 || kind === "FULL") {
      const rebuild = await rebuildTrades(account.id, new Set(executions.map((e) => e.instrumentId)));
      stats.trades += rebuild.trades;
      for (const f of rebuild.failed) addSkipped(`сделки не собраны (${f.secid})`);
    }

    await db().brokerAccount.update({ where: { id: account.id }, data: { syncedUntil: to } });
    await fillStartingCapital(account.id);
  }

  return stats;
}

/**
 * Начальный капитал для кривой капитала, если пользователь его не задал: пополнения минус выводы.
 * Пользователь может поправить значение в личном кабинете — тогда оно не перезаписывается.
 */
async function fillStartingCapital(accountId: string) {
  const account = await db().brokerAccount.findUnique({ where: { id: accountId }, select: { startingCapital: true } });
  if (account?.startingCapital !== null) return;
  const { _sum } = await db().cashOperation.aggregate({
    where: { accountId, type: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    _sum: { amountRub: true },
  });
  if (_sum.amountRub && _sum.amountRub.gt(0)) {
    await db().brokerAccount.update({ where: { id: accountId }, data: { startingCapital: _sum.amountRub } });
  }
}

/** Цена для хранения: облигации — в % от номинала (брокер присылает цену деньгами), остальное как есть. */
function storedPrice(price: number, instrument: ResolvedInstrument): number {
  if (instrument.assetClass === "BOND" && instrument.faceValue) {
    return new Decimal(price).div(instrument.faceValue).mul(100).toDecimalPlaces(9).toNumber();
  }
  return price;
}

/** Активные API-подключения для плановой синхронизации. */
export async function listConnectionsForScheduledSync(): Promise<string[]> {
  const rows = await db().brokerConnection.findMany({
    where: { status: { in: ["ACTIVE", "ERROR"] }, broker: { not: "FILE" } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

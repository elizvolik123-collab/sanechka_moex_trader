import type { BrokerType } from "@/generated/prisma/enums";
import { createBrokerAdapter } from "../brokers";
import { BrokerAuthError, BrokerRequestError, BrokerUnavailableError, type BrokerAccountInfo } from "../brokers/types";
import { db } from "../db";
import { secretHint } from "../crypto";
import { enqueueBrokerSync } from "../jobs/queues";
import { encryptToken } from "../secrets";

/**
 * Брокерские подключения пользователя. Каждый запрос ограничен userId владельца;
 * tokenCipher никогда не выбирается в данных для интерфейса.
 */

const connectionPublicSelect = {
  id: true,
  broker: true,
  label: true,
  tokenLast4: true,
  status: true,
  lastSyncAt: true,
  lastSyncError: true,
  createdAt: true,
  accounts: {
    select: { id: true, name: true, externalId: true, isEnabled: true, syncedUntil: true, startingCapital: true },
    orderBy: { name: "asc" as const },
  },
  syncRuns: {
    select: { status: true, kind: true, startedAt: true, finishedAt: true, error: true, stats: true },
    orderBy: { startedAt: "desc" as const },
    take: 1,
  },
};

export async function listConnections(userId: string) {
  const rows = await db().brokerConnection.findMany({
    where: { userId },
    select: connectionPublicSelect,
    orderBy: { createdAt: "asc" },
  });
  // Decimal не передаётся в клиентские компоненты — приводим к числу
  return rows.map((c) => ({
    ...c,
    accounts: c.accounts.map((a) => ({ ...a, startingCapital: a.startingCapital?.toNumber() ?? null })),
  }));
}

export async function setStartingCapital(userId: string, accountId: string, value: number | null): Promise<boolean> {
  const { count } = await db().brokerAccount.updateMany({
    where: { id: accountId, connection: { userId } },
    data: { startingCapital: value },
  });
  return count > 0;
}

export type ConnectionView = Awaited<ReturnType<typeof listConnections>>[number];

export type CreateConnectionResult =
  | { ok: true; id: string; accounts: number }
  | { ok: false; field: "token" | "form"; message: string };

/**
 * Проверяет токен у брокера (список счетов), сохраняет подключение с зашифрованным токеном
 * и ставит первичную синхронизацию в очередь.
 */
export async function createApiConnection(input: {
  userId: string;
  broker: Extract<BrokerType, "TINVEST" | "FINAM" | "ALOR">;
  label: string;
  token: string;
}): Promise<CreateConnectionResult> {
  let accounts: BrokerAccountInfo[];
  try {
    accounts = await createBrokerAdapter(input.broker, input.token, "interactive").listAccounts();
  } catch (error) {
    if (error instanceof BrokerAuthError) return { ok: false, field: "token", message: "Брокер не принял токен: проверьте, что он скопирован целиком и не отозван" };
    if (error instanceof BrokerRequestError) return { ok: false, field: "token", message: error.message };
    if (error instanceof BrokerUnavailableError) {
      return { ok: false, field: "form", message: "T-Invest API сейчас недоступен — не удалось проверить токен. Попробуйте позже" };
    }
    throw error;
  }
  if (accounts.length === 0) return { ok: false, field: "token", message: "У токена нет доступа ни к одному счёту" };

  const { blob, keyVersion } = encryptToken(input.token);
  const connection = await db().brokerConnection.create({
    data: {
      userId: input.userId,
      broker: input.broker,
      label: input.label,
      tokenCipher: blob,
      tokenKeyVersion: keyVersion,
      tokenLast4: secretHint(input.token),
      accounts: { create: accounts.map((a) => ({ externalId: a.externalId, name: a.name })) },
    },
    select: { id: true },
  });
  await enqueueBrokerSync({ connectionId: connection.id, kind: "FULL" });
  return { ok: true, id: connection.id, accounts: accounts.length };
}

/** Включить или исключить счёт из дневника (и из синхронизации). */
export async function setAccountEnabled(userId: string, accountId: string, isEnabled: boolean): Promise<boolean> {
  const { count } = await db().brokerAccount.updateMany({
    where: { id: accountId, connection: { userId } },
    data: { isEnabled },
  });
  return count > 0;
}

export async function deleteConnection(userId: string, connectionId: string): Promise<boolean> {
  // Каскадно удаляются счета, исполнения, сделки и история синхронизаций этого подключения
  const { count } = await db().brokerConnection.deleteMany({ where: { id: connectionId, userId } });
  return count > 0;
}

export type SyncRequestResult = "queued" | "already-queued" | "not-found" | "not-supported";

export async function requestSync(userId: string, connectionId: string): Promise<SyncRequestResult> {
  const connection = await db().brokerConnection.findFirst({
    where: { id: connectionId, userId },
    select: { id: true, broker: true, lastSyncAt: true },
  });
  if (!connection) return "not-found";
  if (connection.broker === "FILE") return "not-supported";
  const queued = await enqueueBrokerSync({
    connectionId: connection.id,
    kind: connection.lastSyncAt ? "INCREMENTAL" : "FULL",
  });
  return queued ? "queued" : "already-queued";
}

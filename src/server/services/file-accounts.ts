import { randomUUID } from "node:crypto";
import { db } from "../db";

/** Счета «Импорт из файла»: подключение типа FILE на пользователя и счета внутри него. */

export async function listFileAccounts(userId: string) {
  const rows = await db().brokerAccount.findMany({
    where: { connection: { userId, broker: "FILE" } },
    select: { id: true, name: true, startingCapital: true, _count: { select: { executions: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    startingCapital: r.startingCapital?.toNumber() ?? null,
    executions: r._count.executions,
  }));
}

export type FileAccountView = Awaited<ReturnType<typeof listFileAccounts>>[number];

export async function createFileAccount(userId: string, name: string, startingCapital: number) {
  const connection =
    (await db().brokerConnection.findFirst({ where: { userId, broker: "FILE" }, select: { id: true } })) ??
    (await db().brokerConnection.create({
      data: { userId, broker: "FILE", label: "Импорт из файла" },
      select: { id: true },
    }));
  return db().brokerAccount.create({
    data: { connectionId: connection.id, externalId: `file-${randomUUID()}`, name, startingCapital },
    select: { id: true },
  });
}

/** Счёт импорта, принадлежащий пользователю, или null. */
export async function findOwnFileAccount(userId: string, accountId: string) {
  return db().brokerAccount.findFirst({
    where: { id: accountId, connection: { userId, broker: "FILE" } },
    select: { id: true, connectionId: true },
  });
}

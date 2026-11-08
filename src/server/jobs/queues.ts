import { PgBoss } from "pg-boss";
import { getEnv } from "../env";

/** Очереди фоновых задач (pg-boss, хранится в схеме pgboss той же БД). */
export const QUEUES = {
  /** Синхронизация одного брокерского подключения */
  brokerSync: "broker-sync",
  /** По расписанию: ставит инкрементальную синхронизацию всем активным подключениям */
  brokerSyncAll: "broker-sync-all",
  /** Раз в сутки: спецификации инструментов MOEX ISS */
  moexSpecs: "moex-specs",
  /** Раз в минуту: новые посты Telegram-канала */
  newsFetch: "news-fetch",
} as const;

export type BrokerSyncJob = {
  connectionId: string;
  kind: "FULL" | "INCREMENTAL";
};

export async function ensureQueues(boss: PgBoss) {
  // stately + singletonKey: не больше одной ожидающей и одной выполняемой синхронизации на подключение
  await boss.createQueue(QUEUES.brokerSync, { policy: "stately", retryLimit: 2, retryDelay: 60 });
  await boss.createQueue(QUEUES.brokerSyncAll, { policy: "singleton" });
  await boss.createQueue(QUEUES.moexSpecs, { policy: "singleton", retryLimit: 5, retryDelay: 600 });
  // singleton: если сбор затянулся, следующий запуск не наложится; без повторов — через минуту будет новый
  await boss.createQueue(QUEUES.newsFetch, { policy: "singleton", retryLimit: 0, expireInSeconds: 300 });
}

export function createBoss(role: "web" | "worker") {
  return new PgBoss({
    connectionString: getEnv().DATABASE_URL,
    schema: "pgboss",
    // Обслуживание очередей и расписание выполняет только воркер
    supervise: role === "worker",
    schedule: role === "worker",
  });
}

const globalForBoss = globalThis as unknown as { boss?: Promise<PgBoss> };

/** Клиент очереди для веб-процесса: только постановка задач. */
export function getWebBoss(): Promise<PgBoss> {
  globalForBoss.boss ??= (async () => {
    const boss = createBoss("web");
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })().catch((error) => {
    globalForBoss.boss = undefined;
    throw error;
  });
  return globalForBoss.boss;
}

/** Возвращает false, если синхронизация этого подключения уже стоит в очереди. */
export async function enqueueBrokerSync(job: BrokerSyncJob): Promise<boolean> {
  const boss = await getWebBoss();
  const id = await boss.send(QUEUES.brokerSync, job, { singletonKey: job.connectionId });
  return id !== null;
}

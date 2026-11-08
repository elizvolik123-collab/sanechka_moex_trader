/**
 * Фоновый воркер: синхронизация брокеров, спецификации MOEX и сбор новостей Telegram —
 * по расписанию и по запросу.
 */
import "dotenv/config";
import { db } from "@/server/db";
import { createBoss, ensureQueues, QUEUES, type BrokerSyncJob } from "@/server/jobs/queues";
import { logger as rootLogger } from "@/server/logger";
import { syncInstrumentSpecs } from "@/server/services/instruments";
import { collectNews } from "@/server/services/news";
import { listConnectionsForScheduledSync, runBrokerSync } from "@/server/services/sync";

const logger = rootLogger.child({ service: "worker" });

async function main() {
  const boss = createBoss("worker");
  boss.on("error", (error) => logger.error({ err: error }, "Ошибка pg-boss"));
  await boss.start();
  await ensureQueues(boss);

  await boss.work<BrokerSyncJob>(QUEUES.brokerSync, { localConcurrency: 2 }, async ([job]) => {
    logger.info({ connectionId: job.data.connectionId, kind: job.data.kind }, "Синхронизация брокера");
    await runBrokerSync(job.data);
  });

  await boss.work(QUEUES.brokerSyncAll, async () => {
    const ids = await listConnectionsForScheduledSync();
    for (const connectionId of ids) {
      await boss.send(QUEUES.brokerSync, { connectionId, kind: "INCREMENTAL" } satisfies BrokerSyncJob, {
        singletonKey: connectionId,
      });
    }
    logger.info({ count: ids.length }, "Плановая синхронизация поставлена в очередь");
  });

  // Ошибка (ISS недоступна) пробрасывается — pg-boss повторит задачу через 10 минут
  await boss.work(QUEUES.moexSpecs, async () => {
    await syncInstrumentSpecs();
  });

  await boss.work(QUEUES.newsFetch, async () => {
    await collectNews();
  });

  // Новости — каждую минуту (минимальный шаг расписания pg-boss)
  await boss.schedule(QUEUES.newsFetch, "* * * * *", null, { tz: "Europe/Moscow" });
  // Первый сбор (и загрузка истории при пустой базе) — сразу при старте
  await boss.send(QUEUES.newsFetch, {});

  // Каждые 30 минут в торговые часы (по Москве)
  await boss.schedule(QUEUES.brokerSyncAll, "*/30 7-23 * * *", null, { tz: "Europe/Moscow" });
  // Спецификации (ГО, шаг, лотность) — каждое утро до открытия основной сессии
  await boss.schedule(QUEUES.moexSpecs, "30 6 * * *", null, { tz: "Europe/Moscow" });

  // Пустой справочник (первый запуск) — загружаем сразу, не дожидаясь утра
  if ((await db().instrument.count({ where: { isTraded: true } })) === 0) {
    await boss.send(QUEUES.moexSpecs, {});
  }

  logger.info("Воркер запущен");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Остановка воркера");
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.fatal({ err: error }, "Воркер не запустился");
  process.exit(1);
});

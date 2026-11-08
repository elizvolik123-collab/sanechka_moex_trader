/**
 * Локальный PostgreSQL для разработки без Docker (бинарники из пакета embedded-postgres).
 * Данные лежат в .data/pg и сохраняются между запусками. Остановка — Ctrl+C.
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.DEV_DB_PORT ?? 5433);
const password = process.env.DEV_DB_PASSWORD;
if (!password) throw new Error("Задайте DEV_DB_PASSWORD в .env или выполните pnpm setup:local");
const databaseName = process.env.DEV_DB_NAME ?? "moex_trader";
const databaseDir = path.resolve(".data/pg");

const pg = new EmbeddedPostgres({
  databaseDir,
  port,
  user: "postgres",
  password,
  authMethod: "scram-sha-256",
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  // builtin C.UTF-8: регистронезависимый поиск по кириллице без зависимости от локали Windows
  initdbFlags: ["--encoding=UTF8", "--locale-provider=builtin", "--builtin-locale=C.UTF-8"],
  onLog: () => {},
  onError: (e) => console.error("[postgres]", e),
});

async function main() {
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log("Инициализация кластера в", databaseDir);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (!rowCount) {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(databaseName)}`);
    console.log("Создана база", databaseName);
  }
  await client.end();

  console.log(`PostgreSQL запущен: 127.0.0.1:${port}/${databaseName}`);
}

async function shutdown() {
  await pg.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch(async (e) => {
  console.error(e);
  await pg.stop().catch(() => {});
  process.exit(1);
});

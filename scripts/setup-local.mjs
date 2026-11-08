import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

if (existsSync(".env")) {
  console.log(".env уже есть; настройки сохранены.");
} else if (existsSync(".data/pg/PG_VERSION")) {
  console.error("Локальная база уже есть. Восстановите её прежний .env: новые ключи не расшифруют сохранённые токены.");
  process.exitCode = 1;
} else {
  const password = randomBytes(24).toString("hex");
  const config = [
    "# Локальные настройки. Не отправляйте этот файл и не добавляйте в Git.",
    `DATABASE_URL=postgresql://postgres:${password}@127.0.0.1:5433/moex_trader`,
    `DEV_DB_PASSWORD=${password}`,
    `BETTER_AUTH_SECRET=${randomBytes(32).toString("base64")}`,
    "BETTER_AUTH_URL=http://127.0.0.1:3000",
    `TOKEN_ENCRYPTION_KEYS=1:${randomBytes(32).toString("base64")}`,
    "TOKEN_ENCRYPTION_KEY_VERSION=1",
    "MAIL_LOCAL_OUTBOX=true",
    "",
  ].join("\n");
  writeFileSync(".env", config, { flag: "wx", mode: 0o600 });
  console.log("Создан .env с новыми локальными ключами. Для запуска не нужны токены внешних API.");
}

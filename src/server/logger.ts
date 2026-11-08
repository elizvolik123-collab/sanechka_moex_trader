import pino from "pino";

/** Поля, которые никогда не попадают в логи (токены брокеров, пароли, заголовки авторизации). */
const REDACT_PATHS = [
  "token",
  "*.token",
  "apiToken",
  "*.apiToken",
  "tokenCipher",
  "*.tokenCipher",
  "password",
  "*.password",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "headers.cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: REDACT_PATHS, censor: "[скрыто]" },
});

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { getEnv } from "./env";
import { logger } from "./logger";

export type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * Отправка писем через SMTP. Тестовые письма сохраняются локально только при явном включении.
 */
export async function sendMail(mail: Mail): Promise<void> {
  const env = getEnv();
  if (env.SMTP_URL) {
    const transport = nodemailer.createTransport(env.SMTP_URL);
    await transport.sendMail({ from: env.MAIL_FROM, ...mail });
    logger.info({ to: mail.to, subject: mail.subject }, "Письмо отправлено");
    return;
  }

  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(new URL(env.BETTER_AUTH_URL).hostname);
  if (process.env.MAIL_LOCAL_OUTBOX !== "true" || !loopback) {
    logger.warn("SMTP не настроен — письмо восстановления не отправлено");
    return;
  }

  const dir = path.resolve(".data/mail");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.txt`);
  await writeFile(file, `To: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  logger.warn({ to: mail.to, subject: mail.subject, file }, "SMTP не настроен — письмо сохранено в файл");
}

import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL не задан"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET должен быть не короче 32 символов"),
  BETTER_AUTH_URL: z.url(),
  TOKEN_ENCRYPTION_KEYS: z.string().min(1, "TOKEN_ENCRYPTION_KEYS не задан"),
  TOKEN_ENCRYPTION_KEY_VERSION: z.coerce.number().int().positive(),
  SMTP_URL: z.string().optional().transform((v) => v || undefined),
  MAIL_FROM: z.string().default("MOEX Trader <no-reply@localhost>"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Переменные окружения, проверенные при первом обращении (а не при импорте — чтобы не ломать сборку). */
export function getEnv(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Некорректные переменные окружения:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

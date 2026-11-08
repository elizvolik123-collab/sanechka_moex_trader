import { NextResponse } from "next/server";

/**
 * Простое ограничение частоты запросов (скользящее окно в памяти процесса) для публичных API.
 * Для одного экземпляра web этого достаточно; при горизонтальном масштабировании нужен общий счётчик (Redis/БД).
 */

type Bucket = number[];
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export function isRateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  // Периодически выбрасываем устаревшие ключи, чтобы карта не росла бесконечно
  if (now - lastSweep > 60_000) {
    for (const [k, hits] of buckets) if (!hits.length || now - hits[hits.length - 1] > windowMs) buckets.delete(k);
    lastSweep = now;
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  return false;
}

/** IP клиента: за Caddy/обратным прокси — первый адрес из X-Forwarded-For. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

/** null — можно продолжать; иначе готовый ответ 429. */
export function rateLimit(request: Request, scope: string, limit: number, windowMs = 60_000): NextResponse | null {
  if (!isRateLimited(`${scope}:${clientIp(request)}`, limit, windowMs)) return null;
  return NextResponse.json(
    { error: "Слишком много запросов. Подождите минуту и попробуйте снова" },
    { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } },
  );
}

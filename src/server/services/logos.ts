import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger } from "../logger";

/**
 * Логотипы инструментов с CDN T-Invest (brand.logoName), кэшируются на диске в .data/logos.
 * https://invest-brands.cdn-tinkoff.ru/<имя>x160.png
 */

const CDN = (process.env.TINVEST_LOGO_CDN_URL || "https://invest-brands.cdn-tinkoff.ru").replace(/\/$/, "");
const DIR = path.resolve(".data/logos");

/** PNG логотипа: из кэша, иначе скачивается с CDN. null — логотипа нет. */
export async function getLogo(key: string): Promise<Buffer | null> {
  // Только безопасные имена файлов — защита от обхода путей
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(key)) return null;
  const file = path.join(DIR, `${key}.png`);
  try {
    return await readFile(file);
  } catch {
    // нет в кэше
  }
  try {
    const res = await fetch(`${CDN}/${key}x160.png`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(DIR, { recursive: true });
    await writeFile(file, buf);
    return buf;
  } catch (error) {
    logger.warn({ err: error, key }, "Не удалось загрузить логотип");
    return null;
  }
}

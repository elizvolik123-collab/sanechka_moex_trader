import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { highlightTickers, findTickers } from "@/core/news/tickers";
import { parseChannelPage, type ParsedPost } from "@/core/news/telegram";
import { db } from "../db";
import { logger } from "../logger";

/** Источник ленты: публичный Telegram-канал MarketTwits. */
export const NEWS_CHANNEL = process.env.NEWS_CHANNEL || "markettwits";
const PREVIEW_URL = (process.env.TELEGRAM_PREVIEW_URL || "https://t.me/s").replace(/\/$/, "");
const MEDIA_DIR = path.resolve(".data/news");
/** Первичная загрузка истории: страниц по ~20 постов */
const BACKFILL_PAGES = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(before?: number): Promise<string> {
  const url = `${PREVIEW_URL}/${NEWS_CHANNEL}${before ? `?before=${before}` : ""}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MoexTraderNews/1.0)", "Accept-Language": "ru,en;q=0.8" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Telegram ответил ${res.status}`);
  return res.text();
}

/** Тикеры инструментов (акции и фонды) для подсветки; кэш на 10 минут. */
let knownCache: { at: number; set: Set<string> } | null = null;
export async function knownTickers(): Promise<Set<string>> {
  if (knownCache && Date.now() - knownCache.at < 10 * 60_000) return knownCache.set;
  const rows = await db().instrument.findMany({
    where: { isTraded: true, assetClass: { in: ["SHARE", "ETF"] } },
    select: { secid: true },
  });
  knownCache = { at: Date.now(), set: new Set(rows.map((r) => r.secid.toUpperCase())) };
  return knownCache.set;
}

/** Скачивает картинку поста: ссылки CDN Telegram со временем перестают работать. */
async function downloadMedia(url: string, fileName: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return null;
    await mkdir(MEDIA_DIR, { recursive: true });
    await writeFile(path.join(MEDIA_DIR, fileName), buf);
    return fileName;
  } catch (error) {
    logger.warn({ err: error, url }, "Не удалось скачать картинку новости");
    return null;
  }
}

/** Сохраняет посты: новые — с картинками, изменённые — обновляет текст. Возвращает число новых. */
async function savePosts(posts: ParsedPost[], known: Set<string>): Promise<number> {
  if (posts.length === 0) return 0;
  const existing = await db().newsPost.findMany({
    where: { channel: NEWS_CHANNEL, messageId: { in: posts.map((p) => p.messageId) } },
    select: { id: true, messageId: true, html: true },
  });
  const byId = new Map(existing.map((e) => [e.messageId, e]));
  let created = 0;

  for (const p of posts) {
    const prev = byId.get(p.messageId);
    if (prev) {
      if (prev.html !== p.html) {
        await db().newsPost.update({
          where: { id: prev.id },
          data: { html: p.html, text: p.text, tickers: findTickers(p.text, known), editedAt: new Date() },
        });
      }
      continue;
    }
    const post = await db().newsPost.create({
      data: {
        channel: NEWS_CHANNEL,
        messageId: p.messageId,
        publishedAt: p.publishedAt,
        html: p.html,
        text: p.text,
        tickers: findTickers(p.text, known),
      },
      select: { id: true },
    });
    for (const [i, m] of p.media.entries()) {
      const ext = /\.(png|webp|gif)(\?|$)/i.exec(m.url)?.[1]?.toLowerCase() ?? "jpg";
      const storedPath = await downloadMedia(m.url, `${p.messageId}-${i}.${ext}`);
      await db().newsMedia.create({ data: { postId: post.id, kind: m.kind, sourceUrl: m.url, storedPath } });
    }
    created += 1;
  }
  return created;
}

/**
 * Сбор новостей (воркер, раз в минуту): последняя страница канала,
 * а при пустой базе — ещё несколько страниц истории.
 */
export async function collectNews(): Promise<{ created: number }> {
  const known = await knownTickers();
  const isEmpty = (await db().newsPost.count({ where: { channel: NEWS_CHANNEL } })) === 0;

  let page = parseChannelPage(await fetchPage(), NEWS_CHANNEL);
  let created = await savePosts(page.posts, known);

  for (let i = 0; isEmpty && page.before && i < BACKFILL_PAGES; i++) {
    await sleep(1500); // бережно к t.me
    page = parseChannelPage(await fetchPage(page.before), NEWS_CHANNEL);
    created += await savePosts(page.posts, known);
  }
  if (created) logger.info({ created }, "Новые посты канала сохранены");
  return { created };
}

export type NewsItem = {
  id: string;
  messageId: number;
  publishedAt: string;
  edited: boolean;
  html: string;
  url: string;
  media: { id: string; kind: string; width: number | null; height: number | null }[];
};

const PAGE_SIZE = 20;

/**
 * Лента: от новых к старым. before — курсор бесконечной прокрутки (messageId), since — только посты новее
 * (автообновление), q — поиск по тексту (pg_trgm-индекс).
 */
export async function listNews(opts: { before?: number; since?: number; q?: string; limit?: number }): Promise<NewsItem[]> {
  const q = opts.q?.trim();
  const rows = await db().newsPost.findMany({
    where: {
      channel: NEWS_CHANNEL,
      ...(opts.before ? { messageId: { lt: opts.before } } : {}),
      ...(opts.since ? { messageId: { gt: opts.since } } : {}),
      ...(q ? { text: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { messageId: "desc" },
    take: Math.min(opts.limit ?? PAGE_SIZE, 50),
    include: { media: { select: { id: true, kind: true, width: true, height: true }, orderBy: { id: "asc" } } },
  });
  const known = await knownTickers();
  return rows.map((r) => ({
    id: r.id,
    messageId: r.messageId,
    publishedAt: r.publishedAt.toISOString(),
    edited: r.editedAt !== null,
    html: highlightTickers(r.html, known),
    url: `https://t.me/${r.channel}/${r.messageId}`,
    media: r.media,
  }));
}

/** Файл картинки новости: локальная копия или null (тогда отдаётся исходная ссылка). */
export async function readNewsMedia(id: string): Promise<{ file: Buffer; type: string } | { redirect: string } | null> {
  const media = await db().newsMedia.findUnique({ where: { id } });
  if (!media) return null;
  if (media.storedPath && /^[\w.-]+$/.test(media.storedPath)) {
    try {
      const file = await readFile(path.join(MEDIA_DIR, media.storedPath));
      const ext = path.extname(media.storedPath).slice(1);
      return { file, type: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg" };
    } catch {
      // файл удалён — отдаём исходную ссылку
    }
  }
  return { redirect: media.sourceUrl };
}

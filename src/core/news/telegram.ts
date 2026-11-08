import { parse, type HTMLElement } from "node-html-parser";
import sanitizeHtml from "sanitize-html";

/**
 * Разбор публичного веб-превью Telegram-канала (https://t.me/s/<канал>).
 * Обычный бот не может читать чужой канал, а превью публичного канала доступно без аккаунта.
 * Чистые функции — покрыты тестами на синтетической разметке того же вида.
 */

export type ParsedMedia = { kind: "photo" | "video_thumb"; url: string };

export type ParsedPost = {
  channel: string;
  messageId: number;
  publishedAt: Date;
  edited: boolean;
  /** Очищенный HTML: только безопасная разметка текста и ссылки */
  html: string;
  /** Плоский текст для поиска и поиска тикеров */
  text: string;
  media: ParsedMedia[];
  views: number | null;
};

export type ParsedPage = {
  posts: ParsedPost[];
  /** id для подгрузки более старых постов (?before=) или null, если их нет */
  before: number | null;
};

const BG_URL = /background-image:\s*url\(['"]?([^'")]+)['"]?\)/i;

/** "16.9K" → 16900, "1.2M" → 1200000, "845" → 845 */
export function parseViews(raw: string | undefined | null): number | null {
  const m = /^([\d.]+)\s*([KM]?)$/i.exec((raw ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]) * (m[2].toUpperCase() === "K" ? 1e3 : m[2].toUpperCase() === "M" ? 1e6 : 1);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * Очистка HTML поста: эмодзи-картинки Telegram → сами символы, хэштеги → ссылки на поиск в канале,
 * все внешние ссылки открываются в новой вкладке, скрипты/стили/атрибуты — вырезаются.
 */
export function sanitizePostHtml(raw: string, channel: string): string {
  const unwrapped = raw.replace(/<i class="emoji"[^>]*>(?:<b>)?([\s\S]*?)(?:<\/b>)?<\/i>/g, "$1");
  return sanitizeHtml(unwrapped, {
    allowedTags: ["b", "strong", "i", "em", "u", "s", "del", "a", "br", "code", "pre", "blockquote", "tg-spoiler"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        let href = attribs.href ?? "";
        // Хэштеги в превью — относительные ссылки на поиск по каналу
        if (href.startsWith("?")) href = `https://t.me/s/${channel}${href}`;
        else if (href.startsWith("/")) href = `https://t.me${href}`;
        return { tagName, attribs: { href, target: "_blank", rel: "noopener noreferrer nofollow" } };
      },
      "tg-spoiler": "span",
    },
  }).trim();
}

/** Плоский текст из очищенного HTML: переводы строк вместо <br>, сущности раскодированы. */
export function htmlToText(html: string): string {
  return parse(html.replace(/<br\s*\/?>/gi, "\n"))
    .textContent.replace(/[ \t]+\n/g, "\n")
    .trim();
}

function mediaOf(el: HTMLElement): ParsedMedia[] {
  const media: ParsedMedia[] = [];
  for (const wrap of el.querySelectorAll(".tgme_widget_message_photo_wrap")) {
    const url = BG_URL.exec(wrap.getAttribute("style") ?? "")?.[1];
    if (url) media.push({ kind: "photo", url: url.startsWith("//") ? `https:${url}` : url });
  }
  for (const thumb of el.querySelectorAll(".tgme_widget_message_video_thumb")) {
    const url = BG_URL.exec(thumb.getAttribute("style") ?? "")?.[1];
    if (url) media.push({ kind: "video_thumb", url: url.startsWith("//") ? `https:${url}` : url });
  }
  return media;
}

export function parseChannelPage(html: string, channel: string): ParsedPage {
  const root = parse(html);
  const posts: ParsedPost[] = [];

  for (const el of root.querySelectorAll(".tgme_widget_message[data-post]")) {
    const [postChannel, idRaw] = (el.getAttribute("data-post") ?? "").split("/");
    const messageId = Number(idRaw);
    if (postChannel?.toLowerCase() !== channel.toLowerCase() || !Number.isInteger(messageId)) continue;

    const datetime = el.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime");
    const publishedAt = datetime ? new Date(datetime) : null;
    if (!publishedAt || Number.isNaN(publishedAt.getTime())) continue;

    const textEl = el.querySelector(".tgme_widget_message_text");
    const cleanHtml = textEl ? sanitizePostHtml(textEl.innerHTML, channel) : "";
    const media = mediaOf(el);
    // Служебные сообщения (смена аватара и т.п.) — без текста и картинок
    if (!cleanHtml && media.length === 0) continue;

    const meta = el.querySelector(".tgme_widget_message_meta")?.textContent ?? "";
    posts.push({
      channel,
      messageId,
      publishedAt,
      edited: /\bedited\b/i.test(meta),
      html: cleanHtml,
      text: htmlToText(cleanHtml),
      media,
      views: parseViews(el.querySelector(".tgme_widget_message_views")?.textContent),
    });
  }

  const prev = root.querySelector('link[rel="prev"]')?.getAttribute("href") ?? "";
  const before = Number(/[?&]before=(\d+)/.exec(prev)?.[1]);
  return { posts, before: Number.isInteger(before) && before > 0 ? before : null };
}

import { visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import { ExternalLinkIcon } from "lucide-react";
import { listNews, NEWS_CHANNEL } from "@/server/services/news";
import { NewsFeed } from "./news-feed";

export const metadata: Metadata = { title: "Новости" };

export default async function NewsPage({ searchParams }: PageProps<"/news">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const items = visualPreview ? [{
    id: "demo-news", messageId: 1, publishedAt: "2026-01-01T09:00:00Z", edited: false,
    html: "<p>Учебный пример новости рынка. Тикер <a class='ticker-link' href='/calculator?ticker=SBER'>SBER</a> открывает калькулятор позиции.</p>",
    url: "#content", media: [],
  }] : await listNews({ q: query });

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Новости</h1>
        <p className="text-sm text-muted-foreground">
          Источник — Telegram-канал MarketTwits:{" "}
          <a
            href={`https://t.me/${NEWS_CHANNEL}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            t.me/{NEWS_CHANNEL} <ExternalLinkIcon className="size-3" />
          </a>
          . Тексты принадлежат авторам канала; время публикации — московское. Тикеры в тексте ведут в калькулятор.
        </p>
      </div>
      <NewsFeed initialItems={items} initialQuery={query} />
    </div>
  );
}

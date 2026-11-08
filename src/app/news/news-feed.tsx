"use client";

import { visualPreview } from "@/lib/visual-preview";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpIcon, ExternalLinkIcon, LoaderCircleIcon, PencilIcon, SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTimeMsk } from "@/lib/format";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { NewsItem } from "@/server/services/news";

const POLL_MS = 60_000;

async function fetchNews(params: Record<string, string | number | undefined>): Promise<NewsItem[]> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const res = await fetch(`/api/news?${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Не удалось загрузить новости");
  return ((await res.json()) as { items: NewsItem[] }).items;
}

/** Лента: поиск, бесконечная прокрутка вниз, новые посты сверху раз в минуту. */
export function NewsFeed({ initialItems, initialQuery }: { initialItems: NewsItem[]; initialQuery: string }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState(initialQuery);
  const [activeQuery, setActiveQuery] = useState(initialQuery);
  const [hasMore, setHasMore] = useState(initialItems.length >= 20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<NewsItem[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const sentinel = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  // Поиск: запрос через 400 мс после последнего ввода, адрес страницы обновляется
  useEffect(() => {
    if (query === activeQuery) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const next = visualPreview ? initialItems.filter((item) => item.html.toLowerCase().includes(query.trim().toLowerCase())) : await fetchNews({ q: query });
        setItems(next);
        setHasMore(next.length >= 20);
        setPending([]);
        setActiveQuery(query);
        setError(null);
        const url = new URL(window.location.href);
        if (query) url.searchParams.set("q", query);
        else url.searchParams.delete("q");
        window.history.replaceState(null, "", url);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, activeQuery, initialItems]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || items.length === 0) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const older = await fetchNews({ before: items.at(-1)!.messageId, q: activeQuery });
      setItems((cur) => [...cur, ...older.filter((o) => !cur.some((c) => c.id === o.id))]);
      setHasMore(older.length >= 20);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [hasMore, items, activeQuery]);

  // Бесконечная прокрутка: подгружаем, когда низ ленты почти виден
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const prepend = useCallback((fresh: NewsItem[]) => {
    setItems((cur) => [...fresh.filter((f) => !cur.some((c) => c.id === f.id)), ...cur]);
    setFreshIds(new Set(fresh.map((f) => f.id)));
    setTimeout(() => setFreshIds(new Set()), 4000);
  }, []);

  // Автообновление: раз в минуту, пока вкладка видима. Наверху ленты — сразу, ниже — по кнопке
  useEffect(() => {
    if (visualPreview) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const newest = pending[0]?.messageId ?? items[0]?.messageId;
      try {
        const fresh = await fetchNews({ since: newest, q: activeQuery });
        if (fresh.length === 0) return;
        if (window.scrollY < 200 && pending.length === 0) prepend(fresh);
        else setPending((p) => [...fresh, ...p]);
      } catch {
        // временная ошибка сети — попробуем через минуту
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [items, pending, activeQuery, prepend]);

  function showPending() {
    prepend(pending);
    setPending([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="grid gap-4">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по новостям: «ставка», «Сбер», SBER…"
          aria-label="Поиск по новостям"
          className="h-10 px-9"
          maxLength={100}
        />
        {query && (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => setQuery("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {pending.length > 0 && (
        <div className="sticky top-20 z-20 flex justify-center">
          <Button size="sm" onClick={showPending} className="shadow-md">
            <ArrowUpIcon /> {pending.length} {plural(pending.length, ["новый пост", "новых поста", "новых постов"])}
          </Button>
        </div>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {items.length === 0 && !loading ? (
        <Card className="border-dashed">
          <CardContent className="text-sm text-muted-foreground">
            {activeQuery ? `По запросу «${activeQuery}» ничего не найдено.` : "Новостей пока нет — лента загружается фоновой задачей, обычно в течение минуты."}
          </CardContent>
        </Card>
      ) : (
        <ol className="grid gap-4" aria-label="Лента новостей" aria-busy={loading}>
          {items.map((item) => (
            <li key={item.id}>
              <NewsCard item={item} fresh={freshIds.has(item.id)} />
            </li>
          ))}
        </ol>
      )}

      <div ref={sentinel} className="flex min-h-10 items-center justify-center text-sm text-muted-foreground">
        {loading ? (
          <LoaderCircleIcon className="size-5 animate-spin" aria-label="Загрузка" />
        ) : hasMore && items.length > 0 ? (
          // Прокрутка подгружает сама; кнопка — для клавиатуры и на случай, если наблюдатель не сработал
          <Button variant="outline" size="sm" onClick={() => void loadMore()}>
            Показать ещё
          </Button>
        ) : items.length > 0 ? (
          "Это все сохранённые посты"
        ) : null}
      </div>
    </div>
  );
}

function NewsCard({ item, fresh }: { item: NewsItem; fresh: boolean }) {
  return (
    <Card className={cn("gap-3 py-4 transition-shadow", fresh && "ring-2 ring-primary/50")}>
      <CardContent className="grid gap-3 px-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <time dateTime={item.publishedAt} className="tabular">
            {formatDateTimeMsk(item.publishedAt)}
          </time>
          {item.edited && (
            <span className="inline-flex items-center gap-1">
              <PencilIcon className="size-3" /> изменено
            </span>
          )}
        </div>
        {item.html && (
          // HTML очищен на сервере при сохранении (sanitize-html), ссылки тикеров добавлены сервером
          <div className="news-html text-[15px] leading-relaxed break-words" dangerouslySetInnerHTML={{ __html: item.html }} />
        )}
        {item.media.length > 0 && (
          <div className={cn("grid gap-2", item.media.length > 1 && "grid-cols-2")}>
            {item.media.map((m) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={m.id}
                src={`/api/news/media/${m.id}`}
                alt="Иллюстрация к посту"
                loading="lazy"
                className="max-h-[420px] w-full rounded-lg border bg-muted object-contain"
              />
            ))}
          </div>
        )}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Открыть пост в Telegram <ExternalLinkIcon className="size-3" />
        </a>
      </CardContent>
    </Card>
  );
}

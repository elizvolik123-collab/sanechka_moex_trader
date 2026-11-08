"use client";

import { previewInstrument, visualPreview } from "@/lib/visual-preview";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircleIcon, SearchIcon } from "lucide-react";
import { InstrumentLogo } from "@/components/instrument-logo";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ASSET_CLASS_LABELS } from "@/lib/instruments";
import { cn } from "@/lib/utils";
import type { SearchHit } from "@/server/services/instruments";

/** Поиск инструмента по тикеру или названию с автодополнением (combobox по WAI-ARIA). */
export function InstrumentSearch({ onSelect }: { onSelect: (hit: SearchHit) => void }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    // Пустой запрос: список скрыт (showList), старые результаты заменятся следующим поиском
    if (!q) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        if (visualPreview) {
          const needle = q.toLowerCase();
          setItems([previewInstrument].filter((item) =>
            item.secid.toLowerCase().includes(needle) || item.shortName.toLowerCase().includes(needle)
          ));
          setActive(0);
          return;
        }
        const res = await fetch(`/api/instruments?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const json = (await res.json()) as { items: SearchHit[] };
        setItems(json.items);
        setFailed(false);
        setActive(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function choose(hit: SearchHit) {
    onSelect(hit);
    setQuery("");
    setItems([]);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && items[active]) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className="relative">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
        aria-label="Поиск инструмента"
        placeholder="Тикер или название: SBER, Сбербанк, Si…"
        className="h-11 pl-9 text-base"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {loading && (
        <LoaderCircleIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
        >
          {items.length === 0 && !loading && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {failed ? "Ошибка поиска. Попробуйте ещё раз" : "Ничего не найдено"}
            </li>
          )}
          {items.map((hit, i) => (
            <li
              key={hit.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(hit)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-sm px-2 py-2",
                i === active && "bg-accent text-accent-foreground",
              )}
            >
              <InstrumentLogo ticker={hit.secid} logoName={hit.logoName} className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{hit.secid}</span>
                  <span className="truncate text-sm text-muted-foreground">{hit.shortName}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground">{hit.name}</div>
              </div>
              <Badge variant="outline" className="shrink-0">
                {ASSET_CLASS_LABELS[hit.assetClass]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

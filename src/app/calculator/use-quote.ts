"use client";

import { visualPreview } from "@/lib/visual-preview";

import { useEffect, useState } from "react";
import type { QuoteDto } from "@/server/services/instruments";

const POLL_MS = 15_000;

export type QuoteState = { quote: QuoteDto | null; checkedAt: Date | null };

type Stored = QuoteState & { instrumentId: string | null };

/** Опрос котировки раз в 15 секунд, пока вкладка видима. */
export function useQuote(instrumentId: string | null): QuoteState {
  const [stored, setStored] = useState<Stored>({ instrumentId: null, quote: null, checkedAt: null });

  useEffect(() => {
    if (visualPreview || !instrumentId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let inFlight = false;

    async function poll() {
      // Запрос уже идёт — он сам запланирует следующий, второй цепочки опроса не будет
      if (inFlight) return;
      inFlight = true;
      if (document.visibilityState === "visible") {
        let quote: QuoteDto | null = null;
        try {
          const res = await fetch(`/api/quotes/${instrumentId}`, { signal: controller.signal, cache: "no-store" });
          quote = (await res.json()) as QuoteDto;
        } catch (error) {
          if ((error as Error).name !== "AbortError") quote = { ok: false, error: "Нет связи с сервером" };
        }
        if (!cancelled && quote) setStored({ instrumentId, quote, checkedAt: new Date() });
      }
      inFlight = false;
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    }

    void poll();
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [instrumentId]);

  // Котировка другого (предыдущего) инструмента не показывается
  return stored.instrumentId === instrumentId ? stored : { quote: null, checkedAt: null };
}

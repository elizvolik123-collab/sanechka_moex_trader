"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/** Имя логотипа брокера ("SBER.png") → URL нашего кэширующего прокси. */
export function logoSrc(logoName: string | null | undefined): string | null {
  if (!logoName) return null;
  const key = logoName.replace(/\.png$/i, "");
  return /^[A-Za-z0-9_-]{1,64}$/.test(key) ? `/api/logos/${key}` : null;
}

/**
 * Логотип инструмента (brand.logoName из T-Invest, кэшируется сервером).
 * Если логотипа нет или он не загрузился — заглушка с первыми буквами тикера.
 */
export function InstrumentLogo({ ticker, logoName, className }: { ticker: string; logoName?: string | null; className?: string }) {
  const src = logoSrc(logoName);
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("size-9 shrink-0 rounded-full bg-muted object-cover", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        PALETTE[hash(ticker) % PALETTE.length],
        className,
      )}
    >
      {ticker.replace(/[^A-Za-zА-Яа-я0-9]/g, "").slice(0, 2).toUpperCase()}
    </span>
  );
}

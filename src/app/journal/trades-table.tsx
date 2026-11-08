"use client";

import { useMemo, useState } from "react";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, DownloadIcon, SearchIcon } from "lucide-react";
import { InstrumentLogo } from "@/components/instrument-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toCsv } from "@/lib/csv";
import { formatDuration } from "@/lib/duration";
import { formatDateTimeMsk, MOSCOW_TZ } from "@/lib/format";
import { formatMoney, formatNumber, formatPrice } from "@/lib/number";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { JournalTrade } from "@/server/services/journal";
import { pnlTextClass, signedRub } from "./charts/shared";

type SortKey = "secid" | "direction" | "openedAt" | "closedAt" | "holdingSec" | "lots" | "avgEntry" | "avgExit" | "fees" | "netPnl" | "returnPct";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "secid", label: "Инструмент" },
  { key: "direction", label: "Направление" },
  { key: "openedAt", label: "Вход" },
  { key: "closedAt", label: "Выход" },
  { key: "holdingSec", label: "Удержание", align: "right" },
  { key: "lots", label: "Объём", align: "right" },
  { key: "avgEntry", label: "Цена входа", align: "right" },
  { key: "avgExit", label: "Цена выхода", align: "right" },
  { key: "fees", label: "Комиссия", align: "right" },
  { key: "netPnl", label: "Результат", align: "right" },
  { key: "returnPct", label: "%", align: "right" },
];

const PAGE_SIZES = [25, 50, 100];

const csvDate = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function compare(a: JournalTrade, b: JournalTrade, key: SortKey): number {
  const va = a[key];
  const vb = b[key];
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb), "ru");
}

function exportCsv(rows: JournalTrade[]) {
  const csv = toCsv(
    ["Счёт", "Тикер", "Название", "Направление", "Открытие (МСК)", "Закрытие (МСК)", "Удержание", "Лоты", "Штуки", "Цена входа", "Цена выхода", "Комиссия, ₽", "Результат, ₽", "Результат, %"],
    rows.map((t) => [
      t.accountName,
      t.secid,
      t.shortName,
      t.direction === "LONG" ? "Лонг" : "Шорт",
      // «01.10.2026 10:00:01» без запятой — так Excel распознаёт дату со временем
      csvDate.format(new Date(t.openedAt)).replace(", ", " "),
      csvDate.format(new Date(t.closedAt)).replace(", ", " "),
      formatDuration(t.holdingSec),
      t.lots,
      t.quantity,
      t.avgEntry,
      t.avgExit,
      t.fees,
      t.netPnl,
      t.returnPct,
    ]),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `moex-trader-sdelki-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Таблица сделок: сортировка, фильтры, постраничный вывод, выгрузка в CSV (всех отфильтрованных строк). */
export function TradesTable({ trades, showAccount }: { trades: JournalTrade[]; showAccount: boolean }) {
  const [sort, setSort] = useState<Sort>({ key: "closedAt", dir: "desc" });
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<"all" | "LONG" | "SHORT">("all");
  const [result, setResult] = useState<"all" | "profit" | "loss">("all");
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = trades.filter(
      (t) =>
        (!q || t.secid.toLowerCase().includes(q) || t.shortName.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)) &&
        (direction === "all" || t.direction === direction) &&
        (result === "all" || (result === "profit" ? t.netPnl > 0 : t.netPnl < 0)),
    );
    const sign = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => compare(a, b, sort.key) * sign || compare(b, a, "closedAt"));
  }, [trades, query, direction, result, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * pageSize, current * pageSize + pageSize);
  const total = rows.reduce((s, t) => s + t.netPnl, 0);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "secid" || key === "direction" ? "asc" : "desc" }));
    setPage(0);
  }

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(0);
  };

  if (trades.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-sm text-muted-foreground">За выбранный период закрытых сделок нет.</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-56">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => resetPage(setQuery)(e.target.value)}
            placeholder="Тикер или название"
            aria-label="Поиск по инструменту"
            className="pl-9"
          />
        </div>
        <Select value={direction} onValueChange={resetPage((v: string) => setDirection(v as typeof direction))}>
          <SelectTrigger className="w-36" aria-label="Направление">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Лонг и шорт</SelectItem>
            <SelectItem value="LONG">Только лонг</SelectItem>
            <SelectItem value="SHORT">Только шорт</SelectItem>
          </SelectContent>
        </Select>
        <Select value={result} onValueChange={resetPage((v: string) => setResult(v as typeof result))}>
          <SelectTrigger className="w-40" aria-label="Результат">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Любой результат</SelectItem>
            <SelectItem value="profit">Прибыльные</SelectItem>
            <SelectItem value="loss">Убыточные</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="ml-auto" onClick={() => exportCsv(rows)} disabled={rows.length === 0}>
          <DownloadIcon /> CSV
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="tabular w-full min-w-[980px] text-sm">
          <caption className="sr-only">Сделки за выбранный период</caption>
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                const Icon = active ? (sort.dir === "asc" ? ArrowUpIcon : ArrowDownIcon) : ArrowUpDownIcon;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={cn("px-3 py-2 font-medium", c.align === "right" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1 rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        active && "text-foreground",
                      )}
                    >
                      {c.label}
                      <Icon className={cn("size-3", !active && "opacity-40")} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className="border-t hover:bg-accent/40">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <InstrumentLogo ticker={t.secid} logoName={t.logoName} className="size-8" />
                    <div className="min-w-0">
                      <div className="font-medium">{t.secid}</div>
                      <div className="max-w-44 truncate text-xs text-muted-foreground">{t.shortName}</div>
                      {showAccount && <div className="text-xs text-muted-foreground">{t.accountName}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Badge variant={t.direction === "LONG" ? "success" : "destructive"}>{t.direction === "LONG" ? "Лонг" : "Шорт"}</Badge>
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDateTimeMsk(t.openedAt)}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap">{formatDateTimeMsk(t.closedAt)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground">{formatDuration(t.holdingSec)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <div>{formatNumber(t.lots, 4)} лот.</div>
                  <div className="text-xs text-muted-foreground">{formatNumber(t.quantity, 4)} шт.</div>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(t.avgEntry, t.decimals)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatPrice(t.avgExit, t.decimals)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(t.fees)}</td>
                <td className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap", pnlTextClass(t.netPnl))}>{signedRub(t.netPnl)}</td>
                <td className={cn("px-3 py-2 text-right whitespace-nowrap", pnlTextClass(t.returnPct))}>
                  {t.returnPct > 0 ? "+" : t.returnPct < 0 ? "−" : ""}
                  {formatNumber(Math.abs(t.returnPct), 2)}%
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-muted-foreground">
                  Нет сделок, подходящих под фильтры
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="border-t bg-muted/30 text-sm">
              <tr>
                <td colSpan={9} className="px-3 py-2 text-muted-foreground">
                  Итого по {rows.length} {plural(rows.length, ["сделке", "сделкам", "сделкам"])} (с учётом фильтров)
                </td>
                <td className={cn("px-3 py-2 text-right font-semibold whitespace-nowrap", pnlTextClass(total))}>{signedRub(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {rows.length === 0 ? "0" : `${current * pageSize + 1}–${Math.min(rows.length, (current + 1) * pageSize)}`} из {rows.length}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-8 w-28" aria-label="Строк на странице">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  по {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" className="size-8" aria-label="Предыдущая страница" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeftIcon />
          </Button>
          <span className="tabular">
            {current + 1} / {pages}
          </span>
          <Button variant="outline" size="icon" className="size-8" aria-label="Следующая страница" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  );
}

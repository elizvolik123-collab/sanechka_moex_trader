"use client";

import { useMemo, useState } from "react";
import { bucketKey, type PeriodPnl } from "@/core/stats";
import { calendarLayout, divergingLevel, magnitudeThresholds } from "@/lib/heatmap";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import { ChartCard, pnlTextClass, signedRub } from "./shared";

const WEEKDAYS = ["пн", "", "ср", "", "пт", "", ""];
const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

/** Расходящаяся шкала: 3 ступени на плечо, нейтральная середина — серая. */
const LEVEL_MIX = { 1: 35, 2: 65, 3: 100 } as const;
function cellBackground(level: number, hasTrades: boolean): string {
  if (!hasTrades) return "var(--muted)";
  if (level === 0) return "var(--chart-neutral)";
  const pct = LEVEL_MIX[Math.abs(level) as 1 | 2 | 3];
  const color = level > 0 ? "var(--chart-profit)" : "var(--chart-loss)";
  return `color-mix(in oklch, ${color} ${pct}%, var(--card))`;
}

const humanDay = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`;
};

/** Календарь-тепловая карта P&L по дням (по московскому времени закрытия сделок). */
export function PnlCalendar({ byDay, range }: { byDay: PeriodPnl[]; range: { from: string | null; to: string | null } }) {
  const [active, setActive] = useState<string | null>(null);

  const { layout, map, thresholds } = useMemo(() => {
    const map = new Map(byDay.map((d) => [d.period, d]));
    const first = byDay[0]?.period;
    const last = byDay.at(-1)?.period;
    const from = range.from ? bucketKey(new Date(range.from), "day") : first;
    // to — начало следующего дня: последний день периода — на миллисекунду раньше; не позже сегодняшнего
    const today = bucketKey(new Date(), "day");
    let to = range.to ? bucketKey(new Date(Date.parse(range.to) - 1), "day") : (last ?? today);
    if (to > today) to = today;
    return {
      map,
      thresholds: magnitudeThresholds(byDay.map((d) => d.pnl)),
      layout: from && to && from <= to ? calendarLayout(from, to) : null,
    };
  }, [byDay, range]);

  const activeDay = active ? map.get(active) : undefined;
  // Короткий период — крупные клетки, год — компактные
  const weeksCount = layout?.weeks.length ?? 0;
  const cell = weeksCount <= 10 ? 24 : weeksCount <= 26 ? 18 : 14;

  return (
    <ChartCard title="Календарь результатов" description="Каждая клетка — день; цвет — знак и величина P&L">
      {!layout ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Нет сделок за период</p>
      ) : (
        <div className="grid gap-3">
          <div className="no-scrollbar overflow-x-auto">
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `20px repeat(${layout.weeks.length}, ${cell}px)` }}>
              <span />
              {layout.weeks.map((_, w) => (
                <span key={w} className="h-4 text-[10px] leading-4 whitespace-nowrap text-muted-foreground">
                  {layout.months.find((m) => m.week === w)?.label ?? ""}
                </span>
              ))}
              {WEEKDAYS.map((wd, row) => (
                <div key={row} className="contents">
                  <span className="text-[10px] text-muted-foreground" style={{ lineHeight: `${cell}px` }}>{wd}</span>
                  {layout.weeks.map((week, w) => {
                    const key = week[row];
                    if (!key) return <span key={w} style={{ width: cell, height: cell }} />;
                    const d = map.get(key);
                    const label = `${humanDay(key)}: ${d ? `${signedRub(d.pnl)}, ${d.count} ${plural(d.count, ["сделка", "сделки", "сделок"])}` : "сделок нет"}`;
                    return (
                      <button
                        key={w}
                        type="button"
                        aria-label={label}
                        title={label}
                        onMouseEnter={() => setActive(key)}
                        onFocus={() => setActive(key)}
                        className={cn(
                          "cursor-default rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active === key && "ring-2 ring-foreground/60",
                        )}
                        style={{ width: cell, height: cell, background: cellBackground(d ? divergingLevel(d.pnl, thresholds) : 0, Boolean(d)) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <p className="min-h-4" aria-live="polite">
              {active ? (
                <>
                  {humanDay(active)}:{" "}
                  {activeDay ? (
                    <span className={cn("tabular font-medium", pnlTextClass(activeDay.pnl))}>
                      {signedRub(activeDay.pnl)} · {activeDay.count} {plural(activeDay.count, ["сделка", "сделки", "сделок"])}
                    </span>
                  ) : (
                    "сделок нет"
                  )}
                </>
              ) : (
                "Наведите на день, чтобы увидеть результат"
              )}
            </p>
            <div className="flex items-center gap-1" aria-hidden>
              <span>убыток</span>
              {[-3, -2, -1, 0, 1, 2, 3].map((l) => (
                <span key={l} className="size-3 rounded-[3px]" style={{ background: cellBackground(l, true) }} />
              ))}
              <span>прибыль</span>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

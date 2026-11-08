"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { AreaSeries, ColorType, createChart, CrosshairMode, type IChartApi, type Time, type UTCTimestamp } from "lightweight-charts";
import { MOSCOW_TZ } from "@/lib/format";
import type { JournalCharts } from "@/server/services/journal";
import { ChartCard, pnlTextClass, signedRub } from "./shared";
import { formatMoney } from "@/lib/number";

const HEIGHT = 280;

/** CSS-переменная темы → rgb() через canvas (lightweight-charts не понимает oklch). */
function resolveColor(cssVar: string, alpha = 1): string {
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim() || "#888";
  probe.fillRect(0, 0, 1, 1);
  // Альфа берётся из самого цвета (сетка тёмной темы — белый с 9% непрозрачности) и умножается на запрошенную
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${((a / 255) * alpha).toFixed(3)})`;
}

const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, month: "short", year: "numeric" });

const hourFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, hour: "2-digit", minute: "2-digit" });
const yearFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, year: "numeric" });
// Ось капитала — целые рубли с разрядами: сокращение «1,1 млн» на узком диапазоне даёт одинаковые подписи
const priceFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

const toDate = (t: Time) => new Date((t as number) * 1000);

/** Подписи шкалы времени по МСК: год / месяц / день / время — по типу деления lightweight-charts. */
function tickLabel(time: Time, type: number): string {
  const d = toDate(time);
  if (type === 0) return yearFmt.format(d);
  if (type === 1) return monthFmt.format(d);
  if (type === 2) return dayFmt.format(d);
  return hourFmt.format(d);
}

type Hover = { time: string; value: number; pnl: number; x: number; y: number; width: number } | null;

export function EquityChart({ data, isPnl }: { data: JournalCharts["equity"]; isPnl: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [hover, setHover] = useState<Hover>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || data.length < 2) return;

    // Время сделок должно строго возрастать — совпадающие секунды разводим на 1 с
    let last = 0;
    const points = data.map((p) => {
      let t = Math.floor(Date.parse(p.time) / 1000);
      if (t <= last) t = last + 1;
      last = t;
      return { time: t as UTCTimestamp, value: p.value, pnl: p.pnl, iso: p.time };
    });
    const byTime = new Map(points.map((p) => [p.time as number, p]));

    const text = resolveColor("--muted-foreground");
    const grid = resolveColor("--chart-grid");
    const line = resolveColor("--primary");
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      height: HEIGHT,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: text,
        fontSize: 12,
        fontFamily: getComputedStyle(document.body).fontFamily,
        // Атрибуция TradingView — требование лицензии lightweight-charts
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: grid } },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        tickMarkFormatter: tickLabel,
      },
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { labelVisible: false }, horzLine: { labelVisible: false } },
      localization: {
        locale: "ru-RU",
        timeFormatter: (time: Time) => timeFmt.format(toDate(time)),
        priceFormatter: (v: number) => priceFmt.format(v),
      },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: line,
      lineWidth: 2,
      topColor: resolveColor("--primary", 0.12),
      bottomColor: resolveColor("--primary", 0),
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: resolveColor("--card"),
      crosshairMarkerBackgroundColor: line,
    });
    series.setData(points.map(({ time, value }) => ({ time, value })));
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      const p = param.time !== undefined ? byTime.get(param.time as number) : undefined;
      if (!p || !param.point) {
        setHover(null);
        return;
      }
      setHover({ time: timeFmt.format(new Date(p.iso)), value: p.value, pnl: p.pnl, x: param.point.x, y: param.point.y, width: el.clientWidth });
    });

    return () => chart.remove();
  }, [data, resolvedTheme]);

  const title = isPnl ? "Накопленный P&L" : "Кривая капитала";
  const last = data.at(-1);
  return (
    <ChartCard
      title={title}
      description={
        isPnl
          ? "Начальный капитал не задан — показан накопленный результат сделок"
          : "Капитал после каждой закрытой сделки"
      }
      action={last && <span className="text-lg font-semibold">{formatMoney(last.value)}</span>}
    >
      {data.length < 2 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Недостаточно сделок для графика</p>
      ) : (
        <div className="relative" style={{ height: HEIGHT }}>
          <div ref={ref} className="absolute inset-0" role="img" aria-label={`${title}: ${data.length - 1} сделок, итог ${formatMoney(last!.value)}`} />
          {hover && (
            <div
              className="tabular pointer-events-none absolute z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
              style={{ left: Math.max(0, Math.min(hover.x + 12, hover.width - 180)), top: Math.max(hover.y - 60, 0) }}
            >
              <div className="text-muted-foreground">{hover.time} МСК</div>
              <div className="font-medium">{formatMoney(hover.value)}</div>
              {hover.pnl !== 0 && <div className={pnlTextClass(hover.pnl)}>сделка {signedRub(hover.pnl)}</div>}
            </div>
          )}
        </div>
      )}
    </ChartCard>
  );
}

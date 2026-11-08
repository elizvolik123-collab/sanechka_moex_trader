"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/number";
import { cn } from "@/lib/utils";

/** Карточка графика: заголовок называет, что изображено (у одиночной серии легенда не нужна). */
export function ChartCard({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("min-w-0 gap-3 py-4", className)}>
      {/* Действие (переключатель, итог) уходит под заголовок, если не помещается рядом — на телефоне */}
      <CardHeader className="flex flex-wrap items-start justify-between gap-2 px-4">
        <div className="grid min-w-40 flex-1 gap-1.5">
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </CardHeader>
      <CardContent className="min-w-0 px-4">{children}</CardContent>
    </Card>
  );
}

const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });

/** Подписи оси: 0 / 1,2 тыс. / 3,4 млн — круглые и короткие. */
export function axisRub(value: number): string {
  return value === 0 ? "0" : `${value < 0 ? "−" : ""}${compact.format(Math.abs(value))}`;
}

/** Сумма со знаком: цвет никогда не единственный признак прибыли/убытка. */
export function signedRub(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`;
}

export const pnlTextClass = (v: number) => (v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted-foreground");

/** Заливка столбца по знаку — проверенная на различимость пара цветов графиков. */
export const pnlFill = (v: number) => (v >= 0 ? "var(--chart-profit)" : "var(--chart-loss)");

/** Оформление тултипа: текст в текстовых токенах, цвет — только у маркера. */
export function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; className?: string; swatch?: string }[] }) {
  return (
    <div className="tabular rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.swatch && <span className="size-2 rounded-full" style={{ background: r.swatch }} />}
            {r.label}
          </span>
          <span className={cn("font-medium", r.className)}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

type BarShape = { x?: number; y?: number; width?: number; height?: number; payload?: { pnl?: number } };

/**
 * Столбец со скруглённым «концом данных» (4px) и прямым краем у нулевой линии.
 * orientation: "column" — вертикальные столбцы, "bar" — горизонтальные полосы.
 */
export function roundedBar(orientation: "column" | "bar") {
  function RoundedBar(props: BarShape) {
    const { x = 0, y = 0, width = 0, height = 0, payload } = props;
    const v = payload?.pnl ?? 0;
    const left = Math.min(x, x + width);
    const top = Math.min(y, y + height);
    const w = Math.abs(width);
    const h = Math.abs(height);
    if (w === 0 || h === 0) return null;
    const r = Math.min(4, orientation === "column" ? h : w, (orientation === "column" ? w : h) / 2);
    let d: string;
    if (orientation === "column") {
      d =
        v >= 0
          ? `M${left},${top + h} V${top + r} Q${left},${top} ${left + r},${top} H${left + w - r} Q${left + w},${top} ${left + w},${top + r} V${top + h} Z`
          : `M${left},${top} V${top + h - r} Q${left},${top + h} ${left + r},${top + h} H${left + w - r} Q${left + w},${top + h} ${left + w},${top + h - r} V${top} Z`;
    } else {
      d =
        v >= 0
          ? `M${left},${top} H${left + w - r} Q${left + w},${top} ${left + w},${top + r} V${top + h - r} Q${left + w},${top + h} ${left + w - r},${top + h} H${left} Z`
          : `M${left + w},${top} H${left + r} Q${left},${top} ${left},${top + r} V${top + h - r} Q${left},${top + h} ${left + r},${top + h} H${left + w} Z`;
    }
    return <path d={d} fill={pnlFill(v)} />;
  }
  return RoundedBar;
}

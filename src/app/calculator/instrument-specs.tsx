"use client";

import { CircleAlertIcon, ClockIcon, LoaderCircleIcon } from "lucide-react";
import { formatDateMsk, MOSCOW_TZ } from "@/lib/format";
import { formatMoney, formatNumber, formatPrice } from "@/lib/number";
import type { InstrumentDto } from "@/server/services/instruments";
import type { QuoteState } from "./use-quote";

const timeFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: MOSCOW_TZ, day: "2-digit", month: "2-digit" });

/** Время котировки: «14:35:07 МСК», для вчерашней — «22.10 18:49:59 МСК». */
function quoteTime(iso: string): string {
  const d = new Date(iso);
  const today = dateFmt.format(new Date());
  const day = dateFmt.format(d);
  return `${day === today ? "" : `${day} `}${timeFmt.format(d)} МСК`;
}

export function QuoteLine({ instrument, state }: { instrument: InstrumentDto; state: QuoteState }) {
  const { quote } = state;
  const isBond = instrument.assetClass === "BOND";

  if (!quote) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircleIcon className="size-4 animate-spin" /> Получаем котировку MOEX…
      </p>
    );
  }

  if (quote.ok) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tabular text-2xl font-semibold">
          {formatPrice(quote.last, instrument.decimals)}
          {isBond && <span className="text-base font-normal text-muted-foreground"> %</span>}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <ClockIcon className="size-3" />
          {quote.updatedAt ? `сделка в ${quoteTime(quote.updatedAt)}` : "время сделки неизвестно"}
          {" · "}данные MOEX ISS с задержкой до 15 минут
        </span>
      </div>
    );
  }

  return (
    <div className="grid gap-1 text-sm">
      <p className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <CircleAlertIcon className="size-4 shrink-0" />
        Котировка недоступна: {quote.error}
      </p>
      {instrument.prevPrice != null ? (
        <p className="text-muted-foreground">
          Цена закрытия{instrument.prevPriceDate ? ` ${formatDateMsk(instrument.prevPriceDate)}` : ""}:{" "}
          <span className="tabular font-medium text-foreground">{formatPrice(instrument.prevPrice, instrument.decimals)}</span>
          {isBond && " %"}. Цену входа можно ввести вручную.
        </p>
      ) : (
        <p className="text-muted-foreground">Введите цену входа вручную.</p>
      )}
    </div>
  );
}

export function InstrumentSpecs({ instrument: i }: { instrument: InstrumentDto }) {
  const stepValue =
    i.assetClass === "FUTURE"
      ? i.stepPrice
      : i.assetClass === "BOND"
        ? i.faceValue != null
          ? (i.minStep / 100) * i.faceValue * i.lotSize
          : null
        : i.minStep * i.lotSize;

  const items: [string, string][] = [
    [i.assetClass === "FUTURE" ? "Лот" : "Лотность", i.assetClass === "FUTURE" ? "1 контракт" : `${formatNumber(i.lotSize, 0)} шт.`],
    ["Шаг цены", `${formatPrice(i.minStep, Math.max(i.decimals, 0))}${i.assetClass === "BOND" ? " %" : ""}`],
    ["Стоимость шага", stepValue != null ? `${formatMoney(stepValue, 6)} на лот` : "—"],
  ];
  if (i.assetClass === "FUTURE") {
    items.push(["ГО", i.initialMargin != null ? formatMoney(i.initialMargin) : "нет данных"]);
    if (i.expiresAt) items.push(["Экспирация", formatDateMsk(i.expiresAt)]);
  }
  if (i.assetClass === "BOND") {
    if (i.faceValue != null) items.push(["Номинал", `${formatNumber(i.faceValue)} ${i.currency === "RUB" ? "₽" : i.currency}`]);
    if (i.expiresAt) items.push(["Погашение", formatDateMsk(i.expiresAt)]);
  }

  return (
    <div className="grid gap-2">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {items.map(([k, v]) => (
          <div key={k} className="grid gap-0.5">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="tabular font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">Спецификация MOEX от {formatDateMsk(i.specUpdatedAt)}</p>
    </div>
  );
}

"use client";

import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Direction, RiskResult, RiskWarning } from "@/core/risk";
import { formatMoney, formatNumber, formatPrice } from "@/lib/number";
import { plural } from "@/lib/plural";
import { cn } from "@/lib/utils";
import type { InstrumentDto } from "@/server/services/instruments";

type Severity = "error" | "warning" | "info";

function describeWarning(w: RiskWarning): { severity: Severity; text: string } {
  switch (w.code) {
    case "ZERO_LOTS":
      return {
        severity: "error",
        text: `Риск на 1 лот (${formatMoney(w.riskPerLot)}) больше допустимого риска (${formatMoney(w.riskRub)}). Увеличьте риск на сделку или уменьшите стоп.`,
      };
    case "ONE_CONTRACT_MARGIN_EXCEEDS_DEPOSIT":
      return {
        severity: "error",
        text: `ГО одного контракта (${formatMoney(w.initialMargin)}) больше размера счёта — открыть позицию не получится.`,
      };
    case "MARGIN_EXCEEDS_DEPOSIT":
      return {
        severity: "error",
        text: `Требуемое ГО (${formatMoney(w.marginRequired)}) больше размера счёта. Уменьшите количество контрактов.`,
      };
    case "LEVERAGE":
      return {
        severity: "warning",
        text: `Позиция больше счёта — понадобится маржинальное плечо ×${formatNumber(w.leverage)}.`,
      };
    case "NO_MARGIN_DATA":
      return { severity: "warning", text: "Нет данных о ГО — уточните требования к обеспечению у брокера." };
    case "FOREIGN_CURRENCY":
      return {
        severity: "warning",
        text: `Номинал в валюте ${w.currency}: суммы посчитаны в валюте номинала, а не в рублях.`,
      };
    case "PRICE_ROUNDED":
      return {
        severity: "info",
        text:
          w.field === "entryPrice"
            ? "Цена входа округлена до шага цены."
            : "Цена стопа округлена до шага цены (в сторону от входа, чтобы риск не превысил заданный).",
      };
  }
}

const SEVERITY_STYLES: Record<Severity, string> = {
  error: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  info: "bg-muted text-muted-foreground",
};
const SEVERITY_ICONS = { error: CircleAlertIcon, warning: TriangleAlertIcon, info: InfoIcon };

export function ResultPanel({
  instrument,
  result,
  instrumentError,
  direction,
  hint,
}: {
  instrument: InstrumentDto | null;
  result: RiskResult | null;
  instrumentError?: string;
  direction: Direction;
  hint?: string;
}) {
  if (!instrument) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-sm text-muted-foreground">
          Выберите инструмент — расчёт появится здесь и будет обновляться при изменении любого поля.
        </CardContent>
      </Card>
    );
  }
  if (instrumentError) {
    return (
      <Card>
        <CardContent className="text-sm text-destructive">{instrumentError}</CardContent>
      </Card>
    );
  }
  if (!result) {
    return (
      <Card className="border-dashed">
        <CardContent className="text-sm text-muted-foreground">{hint ?? "Заполните параметры сделки без ошибок."}</CardContent>
      </Card>
    );
  }

  const dp = instrument.decimals;
  const isFuture = instrument.assetClass === "FUTURE";
  const pct = instrument.assetClass === "BOND" ? " %" : "";
  const unit = isFuture ? plural(result.quantity, ["контракт", "контракта", "контрактов"]) : "шт.";
  const sign = direction === "LONG" ? 1 : -1;

  const rows: { label: string; value: string; tone?: "profit" | "loss" }[] = [
    { label: "Риск на сделку", value: `${formatMoney(result.riskRub)}` },
    {
      label: "Стоп-лосс",
      value: `${formatPrice(result.stopPrice, dp)}${pct}  (${sign > 0 ? "−" : "+"}${formatPrice(result.stopDistance, dp)}, ${formatNumber(result.stopSteps, 2)} ${plural(result.stopSteps, ["шаг", "шага", "шагов"])})`,
      tone: "loss",
    },
    {
      label: `Тейк-профит (1:${formatNumber(result.takeDistance / result.stopDistance, 2)})`,
      value: `${formatPrice(result.takePrice, dp)}${pct}  (${sign > 0 ? "+" : "−"}${formatPrice(result.takeDistance, dp)})`,
      tone: "profit",
    },
    { label: "Риск на 1 лот", value: formatMoney(result.riskPerLot) },
    {
      label: isFuture ? "Номинал позиции" : "Сумма позиции",
      value: isFuture ? formatMoney(result.positionValue) : `${formatMoney(result.positionValue)} (${formatNumber(result.depositSharePct, 1)}% счёта)`,
    },
  ];
  if (isFuture && result.marginRequired != null) {
    rows.push({
      label: "Требуемое ГО",
      value: `${formatMoney(result.marginRequired)} (${formatNumber(result.depositSharePct, 1)}% счёта)`,
    });
  }
  if (result.commissionRub > 0) rows.push({ label: "Комиссия (вход + стоп)", value: formatMoney(result.commissionRub) });

  return (
    <Card className="gap-4" aria-live="polite">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">Размер позиции</CardTitle>
        <div className="tabular text-3xl font-bold">
          {formatNumber(result.lots, 0)} {plural(result.lots, ["лот", "лота", "лотов"])}
        </div>
        <div className="tabular text-sm text-muted-foreground">
          = {formatNumber(result.quantity, 0)} {unit} · фактический риск {formatNumber(result.actualRiskPct, 2)}% счёта
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-loss/10 p-3">
            <div className="text-xs text-muted-foreground">Убыток по стопу</div>
            <div className="tabular font-semibold text-loss">−{formatMoney(result.potentialLossRub)}</div>
          </div>
          <div className="rounded-lg bg-profit/10 p-3">
            <div className="text-xs text-muted-foreground">Прибыль по тейку</div>
            <div className="tabular font-semibold text-profit">+{formatMoney(result.potentialProfitRub)}</div>
          </div>
        </div>
        <dl className="grid gap-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5">
              <dt className="text-muted-foreground">{r.label}</dt>
              <dd
                className={cn(
                  "tabular text-right font-medium whitespace-pre-wrap",
                  r.tone === "profit" && "text-profit",
                  r.tone === "loss" && "text-loss",
                )}
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
        {result.warnings.length > 0 && (
          <ul className="grid gap-2">
            {result.warnings.map((w, i) => {
              const { severity, text } = describeWarning(w);
              const Icon = SEVERITY_ICONS[severity];
              return (
                <li key={i} className={cn("flex gap-2 rounded-md px-3 py-2 text-sm", SEVERITY_STYLES[severity])}>
                  <Icon className="mt-0.5 size-4 shrink-0" />
                  {text}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

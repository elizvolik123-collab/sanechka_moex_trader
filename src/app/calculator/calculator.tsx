"use client";

import { previewInstrument, visualPreview } from "@/lib/visual-preview";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { BookmarkPlusIcon, LoaderCircleIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { InstrumentLogo } from "@/components/instrument-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { calculatePosition, type Direction, type RiskField, type StopMode } from "@/core/risk";
import { ASSET_CLASS_LABELS } from "@/lib/instruments";
import { parseNumber, toInputString } from "@/lib/number";
import { cn } from "@/lib/utils";
import type { CalculatorDefaults } from "@/server/services/user-settings";
import type { InstrumentDto, SearchHit } from "@/server/services/instruments";
import { savePlanAction } from "./actions";
import { InstrumentSearch } from "./instrument-search";
import { InstrumentSpecs, QuoteLine } from "./instrument-specs";
import { ResultPanel } from "./result-panel";
import { useQuote } from "./use-quote";

type Form = {
  depositRub: string;
  riskPct: string;
  direction: Direction;
  stopMode: StopMode;
  stopValue: string;
  rewardRatio: string;
  commissionPct: string;
};

const STOP_MODES = [
  { value: "points", label: "Пункты" },
  { value: "percent", label: "% от цены" },
  { value: "price", label: "Цена стопа" },
] as const;

const RR_PRESETS = [1.5, 2, 3, 5];

export function Calculator({
  defaults,
  initialInstrument,
  isLoggedIn,
  catalogEmpty,
}: {
  defaults: CalculatorDefaults;
  initialInstrument: InstrumentDto | null;
  isLoggedIn: boolean;
  catalogEmpty: boolean;
}) {
  const router = useRouter();
  const [instrument, setInstrument] = useState<InstrumentDto | null>(initialInstrument);
  const [loadingInstrument, setLoadingInstrument] = useState(false);
  /** Цена входа, введённая вручную; null — берём текущую цену (или цену закрытия) */
  const [entryOverride, setEntryOverride] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const [form, setForm] = useState<Form>({
    depositRub: toInputString(defaults.depositRub),
    riskPct: toInputString(defaults.riskPct),
    direction: "LONG",
    stopMode: "percent",
    stopValue: "1",
    rewardRatio: toInputString(defaults.rewardRatio),
    commissionPct: defaults.commissionPct ? toInputString(defaults.commissionPct) : "",
  });
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const quoteState = useQuote(instrument?.id ?? null);
  const quote = quoteState.quote;
  const marketPrice = quote?.ok ? quote.last : (instrument?.prevPrice ?? null);
  const entryTouched = entryOverride !== null;
  const entryInput = entryOverride ?? (marketPrice != null ? toInputString(marketPrice) : "");

  async function selectInstrument(hit: SearchHit) {
    setLoadingInstrument(true);
    try {
      let dto = previewInstrument;
      if (!visualPreview) {
        const res = await fetch("/api/instruments/" + hit.id);
        if (!res.ok) throw new Error();
        dto = (await res.json()) as InstrumentDto;
      }
      setInstrument(dto);
      setEntryOverride(null);
      const url = new URL(window.location.href);
      url.searchParams.set("ticker", dto.secid);
      url.searchParams.set("board", dto.board);
      window.history.replaceState(null, "", url);
    } catch {
      toast.error("Не удалось загрузить спецификацию инструмента");
    } finally {
      setLoadingInstrument(false);
    }
  }

  function clearInstrument() {
    setInstrument(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("ticker");
    url.searchParams.delete("board");
    window.history.replaceState(null, "", url);
  }

  const numbers = useMemo(
    () => ({
      depositRub: parseNumber(form.depositRub),
      riskPct: parseNumber(form.riskPct),
      direction: form.direction,
      entryPrice: parseNumber(entryInput),
      stopMode: form.stopMode,
      stopValue: parseNumber(form.stopValue),
      rewardRatio: parseNumber(form.rewardRatio),
      commissionPct: form.commissionPct.trim() ? parseNumber(form.commissionPct) : undefined,
    }),
    [form, entryInput],
  );

  const outcome = useMemo(() => {
    if (!instrument) return null;
    return calculatePosition(
      {
        assetClass: instrument.assetClass,
        lotSize: instrument.lotSize,
        minStep: instrument.minStep,
        stepPrice: instrument.stepPrice,
        faceValue: instrument.faceValue,
        initialMargin: instrument.initialMargin,
        currency: instrument.currency,
      },
      numbers,
    );
  }, [instrument, numbers]);

  // Пустое поле — ещё не заполнено, а не ошибка: подсвечиваем только введённые некорректные значения
  const rawErrors: Partial<Record<RiskField, string>> = outcome && !outcome.ok ? outcome.errors : {};
  const inputs: Record<string, string> = { ...form, entryPrice: entryInput };
  const errors = Object.fromEntries(
    Object.entries(rawErrors).filter(([field]) => !(field in inputs && inputs[field].trim() === "")),
  ) as Partial<Record<RiskField, string>>;
  const result = outcome?.ok ? outcome.result : null;
  const missingEntry = instrument !== null && entryInput.trim() === "";

  /** При смене способа задания стопа пересчитываем значение, чтобы стоп остался на месте. */
  function changeStopMode(mode: StopMode) {
    if (result && instrument) {
      const value =
        mode === "points"
          ? result.stopDistance
          : mode === "percent"
            ? Number(((result.stopDistance / result.entryPrice) * 100).toFixed(3))
            : result.stopPrice;
      setForm((f) => ({ ...f, stopMode: mode, stopValue: toInputString(value) }));
    } else {
      set("stopMode", mode);
    }
  }

  function savePlan() {
    if (!instrument) return;
    startSaving(async () => {
      const res = await savePlanAction({ instrumentId: instrument.id, ...numbers, note: note || undefined });
      if (res.ok) {
        toast.success(res.message, { action: { label: "Открыть", onClick: () => router.push("/account/plans") } });
        setNote("");
      } else {
        toast.error(res.message);
      }
    });
  }

  const isBond = instrument?.assetClass === "BOND";
  const stopLabel =
    form.stopMode === "points" ? "Люфт, пунктов цены" : form.stopMode === "percent" ? "Люфт, % от цены входа" : "Цена стоп-лосса";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="grid min-w-0 content-start gap-6">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Инструмент</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {catalogEmpty && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                Справочник инструментов ещё не загружен из MOEX ISS. Он обновляется фоновой задачей раз в сутки.
              </p>
            )}
            <InstrumentSearch onSelect={selectInstrument} />
            {loadingInstrument && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircleIcon className="size-4 animate-spin" /> Загружаем спецификацию…
              </p>
            )}
            {instrument && !loadingInstrument && (
              <div className="grid gap-4 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <InstrumentLogo ticker={instrument.secid} logoName={instrument.logoName} className="size-11" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{instrument.secid}</span>
                      <Badge variant="outline">{ASSET_CLASS_LABELS[instrument.assetClass]}</Badge>
                      <span className="text-xs text-muted-foreground">{instrument.board}</span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{instrument.name}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Сбросить инструмент" onClick={clearInstrument}>
                    <XIcon />
                  </Button>
                </div>
                <QuoteLine instrument={instrument} state={quoteState} />
                <InstrumentSpecs instrument={instrument} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Параметры сделки</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <Segmented
              label="Направление"
              value={form.direction}
              onChange={(v) => set("direction", v)}
              className="w-full sm:w-72"
              options={[
                // Тонированный фон + текстовый токен: читаемо в обеих темах (белый текст на мятном фоне тёмной темы — нет)
                { value: "LONG", label: "Лонг ↑", className: "bg-profit/15 text-profit ring-1 ring-inset ring-profit/40" },
                { value: "SHORT", label: "Шорт ↓", className: "bg-loss/15 text-loss ring-1 ring-inset ring-loss/40" },
              ]}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Размер счёта, ₽" id="depositRub" error={errors.depositRub}>
                <Input
                  id="depositRub"
                  inputMode="decimal"
                  value={form.depositRub}
                  onChange={(e) => set("depositRub", e.target.value)}
                  aria-invalid={errors.depositRub ? true : undefined}
                />
              </Field>
              <Field label="Риск на сделку, %" id="riskPct" error={errors.riskPct}>
                <Input
                  id="riskPct"
                  inputMode="decimal"
                  value={form.riskPct}
                  onChange={(e) => set("riskPct", e.target.value)}
                  aria-invalid={errors.riskPct ? true : undefined}
                />
              </Field>
            </div>

            <Field
              label={isBond ? "Цена входа, % от номинала" : "Цена входа"}
              id="entryPrice"
              error={errors.entryPrice}
              hint={!entryTouched && marketPrice != null ? (quote?.ok ? "Текущая цена" : "Цена закрытия") : undefined}
            >
              <div className="flex gap-2">
                <Input
                  id="entryPrice"
                  inputMode="decimal"
                  value={entryInput}
                  placeholder={instrument ? "Введите цену" : "Сначала выберите инструмент"}
                  onChange={(e) => setEntryOverride(e.target.value)}
                  aria-invalid={errors.entryPrice ? true : undefined}
                />
                {entryTouched && marketPrice != null && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEntryOverride(null)}
                  >
                    <RotateCcwIcon /> <span className="hidden sm:inline">Текущая</span>
                  </Button>
                )}
              </div>
            </Field>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Стоп-лосс</span>
              <Segmented label="Способ задания стопа" value={form.stopMode} onChange={changeStopMode} options={STOP_MODES} className="w-full" />
              <Field label={stopLabel} id="stopValue" error={errors.stopValue} srOnlyLabel>
                <Input
                  id="stopValue"
                  inputMode="decimal"
                  value={form.stopValue}
                  onChange={(e) => set("stopValue", e.target.value)}
                  placeholder={stopLabel}
                  aria-invalid={errors.stopValue ? true : undefined}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Соотношение риск/прибыль, 1 :" id="rewardRatio" error={errors.rewardRatio}>
                <Input
                  id="rewardRatio"
                  inputMode="decimal"
                  value={form.rewardRatio}
                  onChange={(e) => set("rewardRatio", e.target.value)}
                  aria-invalid={errors.rewardRatio ? true : undefined}
                />
                <div className="flex flex-wrap gap-1">
                  {RR_PRESETS.map((rr) => (
                    <Button
                      key={rr}
                      type="button"
                      size="sm"
                      variant={parseNumber(form.rewardRatio) === rr ? "secondary" : "ghost"}
                      className="h-7 px-2 text-xs"
                      onClick={() => set("rewardRatio", toInputString(rr))}
                    >
                      1:{toInputString(rr)}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field
                label="Комиссия, % от оборота"
                id="commissionPct"
                error={errors.commissionPct}
                hint="За одну сторону; необязательно"
              >
                <Input
                  id="commissionPct"
                  inputMode="decimal"
                  value={form.commissionPct}
                  placeholder="0"
                  onChange={(e) => set("commissionPct", e.target.value)}
                  aria-invalid={errors.commissionPct ? true : undefined}
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4 lg:sticky lg:top-20 lg:self-start">
        <ResultPanel
          instrument={instrument}
          result={result}
          instrumentError={errors.instrument}
          direction={form.direction}
          hint={missingEntry ? "Введите цену входа — расчёт появится сразу." : undefined}
        />
        {result && result.lots > 0 && (
          <Card className="gap-3 py-4">
            <CardContent className="grid gap-3">
              {isLoggedIn ? (
                <>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Заметка к плану (необязательно)" maxLength={500} />
                  <Button onClick={savePlan} disabled={saving}>
                    {saving ? <LoaderCircleIcon className="animate-spin" /> : <BookmarkPlusIcon />}
                    Сохранить как план сделки
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  <Link href="/login?next=/calculator" className="font-medium text-primary hover:underline">
                    Войдите
                  </Link>
                  , чтобы сохранять расчёты как планы сделок.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  error,
  hint,
  srOnlyLabel,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: string;
  srOnlyLabel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className={cn(srOnlyLabel && "sr-only")}>
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

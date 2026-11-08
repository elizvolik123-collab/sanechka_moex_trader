"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CircleAlertIcon, CircleCheckIcon, FileSpreadsheetIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  IMPORT_FIELDS,
  mappingErrors,
  normalizeRows,
  type ColumnMapping,
  type FieldKey,
  type QuantityUnit,
  type RawTable,
  type RowError,
} from "@/core/import/mapping";
import { formatDateTimeMsk } from "@/lib/format";
import { formatNumber, parseNumber } from "@/lib/number";
import { plural } from "@/lib/plural";
import type { FileAccountView } from "@/server/services/file-accounts";
import type { ImportPresetView, ImportSummary } from "@/server/services/journal-import";

type Preview = { fileName: string; table: RawTable; guessed: ColumnMapping; presets: ImportPresetView[] };
type CommitResult = ImportSummary & { accountId: string };

const NONE = "none";
const NEW_ACCOUNT = "new";

/** Шаблон (поле → текст заголовка) → индексы колонок текущего файла; null, если каких-то колонок нет. */
function applyPreset(preset: ImportPresetView, headers: string[]): ColumnMapping | null {
  const mapping: ColumnMapping = {};
  for (const [field, header] of Object.entries(preset.mapping)) {
    if (!header) continue;
    const idx = headers.indexOf(header);
    if (idx < 0) return null;
    mapping[field as FieldKey] = idx;
  }
  return mapping;
}

export function ImportWizard({ accounts }: { accounts: FileAccountView[] }) {
  const [accountChoice, setAccountChoice] = useState(accounts[0]?.id ?? NEW_ACCOUNT);
  const [newName, setNewName] = useState("");
  const [newCapital, setNewCapital] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [quantityUnit, setQuantityUnit] = useState<QuantityUnit>("pieces");
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [loading, setLoading] = useState<"preview" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);

  async function onFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
    if (!f) return;
    setLoading("preview");
    try {
      const body = new FormData();
      body.set("file", f);
      const res = await fetch("/api/journal/import/preview", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось прочитать файл");
      const p = json as Preview;
      setPreview(p);
      // Подходящий сохранённый шаблон важнее автоопределения
      const preset = p.presets.map((pr) => ({ pr, m: applyPreset(pr, p.table.headers) })).find((x) => x.m);
      if (preset) {
        setMapping(preset.m!);
        setQuantityUnit(preset.pr.options.quantityUnit ?? "pieces");
        setAppliedPreset(preset.pr.name);
      } else {
        setMapping(p.guessed);
        setAppliedPreset(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  const normalized = useMemo(
    () => (preview ? normalizeRows(preview.table, mapping) : { rows: [], errors: [] as RowError[] }),
    [preview, mapping],
  );
  const problems = preview ? mappingErrors(mapping) : [];
  const capital = parseNumber(newCapital);
  const accountProblem =
    accountChoice === NEW_ACCOUNT
      ? !newName.trim()
        ? "Введите название нового счёта"
        : !(capital > 0)
          ? "Укажите начальный капитал — от него строится кривая капитала"
          : null
      : null;
  const canCommit = file && preview && problems.length === 0 && !accountProblem && normalized.rows.length > 0;

  async function commit() {
    if (!file || !canCommit) return;
    setLoading("commit");
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("mapping", JSON.stringify(mapping));
      body.set("quantityUnit", quantityUnit);
      if (accountChoice === NEW_ACCOUNT) {
        body.set("newAccountName", newName.trim());
        body.set("startingCapital", String(capital));
      } else {
        body.set("accountId", accountChoice);
      }
      if (presetName.trim()) body.set("presetName", presetName.trim());
      const res = await fetch("/api/journal/import/commit", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось импортировать файл");
      setResult(json as CommitResult);
      if (accountChoice === NEW_ACCOUNT) setAccountChoice((json as CommitResult).accountId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  if (result) return <ImportResult result={result} onAgain={() => { setResult(null); setFile(null); setPreview(null); }} />;

  const columnOptions = preview?.table.headers.map((h, i) => ({ index: i, label: h || `Колонка ${i + 1}` })) ?? [];
  const sampleFor = (idx: number | undefined) =>
    idx === undefined ? "" : (preview?.table.rows.find((r) => (r[idx] ?? "").trim())?.[idx] ?? "");

  return (
    <div className="grid gap-6">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle>1. Счёт</CardTitle>
          <CardDescription>Сделки из файла попадут в выбранный счёт дневника</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-4">
          <Select value={accountChoice} onValueChange={setAccountChoice}>
            <SelectTrigger aria-label="Счёт для импорта">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name} · {formatNumber(a.executions, 0)} {plural(a.executions, ["исполнение", "исполнения", "исполнений"])}
                </SelectItem>
              ))}
              <SelectItem value={NEW_ACCOUNT}>+ Новый счёт</SelectItem>
            </SelectContent>
          </Select>
          {accountChoice === NEW_ACCOUNT && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="newName">Название</Label>
                <Input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Например, «БКС, брокерский»" maxLength={60} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="newCapital">Начальный капитал, ₽</Label>
                <Input id="newCapital" inputMode="decimal" value={newCapital} onChange={(e) => setNewCapital(e.target.value)} placeholder="100 000" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>2. Файл отчёта</CardTitle>
          <CardDescription>CSV (разделитель ; или ,; кодировка UTF-8 или Windows-1251) или XLSX, до 10 МБ</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-accent/40">
            {loading === "preview" ? (
              <LoaderCircleIcon className="size-8 animate-spin text-muted-foreground" />
            ) : file ? (
              <FileSpreadsheetIcon className="size-8 text-primary" />
            ) : (
              <UploadIcon className="size-8 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">{file ? file.name : "Выберите файл"}</span>
            <span className="text-xs text-muted-foreground">
              {preview ? `${formatNumber(preview.table.rows.length, 0)} строк данных` : "Нажмите, чтобы выбрать .csv или .xlsx"}
            </span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx"
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>3. Колонки</CardTitle>
            <CardDescription>
              {appliedPreset
                ? `Применён шаблон «${appliedPreset}». Проверьте сопоставление.`
                : "Колонки определены автоматически по заголовкам. Проверьте и поправьте при необходимости."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2">
              {IMPORT_FIELDS.map((f) => {
                const idx = mapping[f.key];
                return (
                  <div key={f.key} className="grid gap-1.5">
                    <Label htmlFor={`map-${f.key}`}>
                      {f.label}
                      {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Select
                      value={idx === undefined ? NONE : String(idx)}
                      onValueChange={(v) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (v === NONE) delete next[f.key];
                          else next[f.key] = Number(v);
                          return next;
                        })
                      }
                    >
                      <SelectTrigger id={`map-${f.key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— не использовать —</SelectItem>
                        {columnOptions.map((c) => (
                          <SelectItem key={c.index} value={String(c.index)}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {idx !== undefined && (
                      <span className="truncate text-xs text-muted-foreground">Пример: {sampleFor(idx) || "—"}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid gap-2">
              <span className="text-sm font-medium">Количество в отчёте указано в</span>
              <Segmented
                label="Единицы количества"
                value={quantityUnit}
                onChange={setQuantityUnit}
                className="w-full sm:w-72"
                options={[
                  { value: "pieces", label: "штуках" },
                  { value: "lots", label: "лотах" },
                ]}
              />
            </div>

            {problems.length > 0 && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{problems.join(". ")}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {preview && problems.length === 0 && (
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>4. Проверка</CardTitle>
            <CardDescription>
              Распознано {formatNumber(normalized.rows.length, 0)} {plural(normalized.rows.length, ["сделка", "сделки", "сделок"])}
              {normalized.errors.length > 0 && `, строк с ошибками: ${normalized.errors.length}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="overflow-x-auto rounded-md border">
              <table className="tabular w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Строка</th>
                    <th className="px-3 py-2 font-medium">Дата и время</th>
                    <th className="px-3 py-2 font-medium">Инструмент</th>
                    <th className="px-3 py-2 font-medium">Направление</th>
                    <th className="px-3 py-2 text-right font-medium">Кол-во</th>
                    <th className="px-3 py-2 text-right font-medium">Цена</th>
                    <th className="px-3 py-2 text-right font-medium">Комиссия</th>
                  </tr>
                </thead>
                <tbody>
                  {normalized.rows.slice(0, 10).map((r) => (
                    <tr key={r.externalId} className="border-t">
                      <td className="px-3 py-2 text-muted-foreground">{r.rowNumber}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTimeMsk(r.executedAt)}</td>
                      <td className="px-3 py-2 font-medium">{r.ticker ?? r.isin}</td>
                      <td className="px-3 py-2">
                        <Badge variant={r.side === "BUY" ? "success" : "destructive"}>{r.side === "BUY" ? "Покупка" : "Продажа"}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.quantity, 6)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.price, 9)}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(r.brokerFee + r.exchangeFee, 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {normalized.errors.length > 0 && <ErrorList errors={normalized.errors} title="Эти строки не будут загружены" />}

            <div className="grid gap-2 sm:max-w-md">
              <Label htmlFor="presetName">Сохранить сопоставление как шаблон (необязательно)</Label>
              <Input
                id="presetName"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Например, «Отчёт БКС»"
                maxLength={60}
              />
            </div>

            {accountProblem && <p className="text-sm text-destructive">{accountProblem}</p>}
            <Button onClick={commit} disabled={!canCommit || loading === "commit"} className="justify-self-start">
              {loading === "commit" ? <LoaderCircleIcon className="animate-spin" /> : <UploadIcon />}
              Загрузить {formatNumber(normalized.rows.length, 0)} {plural(normalized.rows.length, ["сделку", "сделки", "сделок"])}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ErrorList({ errors, title }: { errors: RowError[]; title: string }) {
  return (
    <Alert>
      <CircleAlertIcon className="text-amber-500" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <ul className="grid gap-0.5">
          {errors.slice(0, 10).map((e) => (
            <li key={e.rowNumber}>
              Строка {e.rowNumber}: {e.message}
            </li>
          ))}
          {errors.length > 10 && <li>…и ещё {errors.length - 10}</li>}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ImportResult({ result, onAgain }: { result: CommitResult; onAgain: () => void }) {
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleCheckIcon className="size-5 text-profit" /> Импорт завершён
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="tabular grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Новых исполнений" value={result.inserted} />
          <Stat label="Уже были загружены" value={result.duplicates} />
          <Stat label="Сделок в дневнике" value={result.trades} hint="по инструментам из файла" />
          <Stat label="Строк с ошибками" value={result.errors.length} />
        </dl>
        {result.rebuildFailed.length > 0 && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>
              Не удалось собрать сделки: {result.rebuildFailed.map((f) => `${f.secid} — ${f.message}`).join("; ")}
            </AlertDescription>
          </Alert>
        )}
        {result.errors.length > 0 && <ErrorList errors={result.errors} title="Не загружены" />}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/journal?account=${result.accountId}`}>Открыть дневник</Link>
          </Button>
          <Button variant="outline" onClick={onAgain}>
            Загрузить ещё файл
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{formatNumber(value, 0)}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

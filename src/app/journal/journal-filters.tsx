"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChartColumnIcon, LoaderCircleIcon, TableIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PeriodPreset } from "@/core/stats";

const ALL = "all";
const PERIODS = [
  { value: "day", label: "День" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "year", label: "Год" },
  { value: "all", label: "Всё" },
  { value: "custom", label: "Период" },
] as const;

export type JournalView = "charts" | "table";

type Value = { accountId: string | null; instrumentId: string | null; period: PeriodPreset; from: string; to: string; view: JournalView };

/** Фильтры дневника хранятся в адресной строке — ссылку на выборку можно сохранить. */
export function JournalFilters({
  accounts,
  instruments,
  value,
}: {
  accounts: { id: string; name: string }[];
  instruments: { id: string; secid: string; shortName: string }[];
  value: Value;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(patch: Partial<Value>) {
    const next = { ...value, ...patch };
    const params = new URLSearchParams();
    if (next.accountId) params.set("account", next.accountId);
    if (next.instrumentId) params.set("instrument", next.instrumentId);
    if (next.period !== "all") params.set("period", next.period);
    if (next.period === "custom") {
      if (next.from) params.set("from", next.from);
      if (next.to) params.set("to", next.to);
    }
    if (next.view !== "charts") params.set("view", next.view);
    startTransition(() => router.push(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={value.accountId ?? ALL} onValueChange={(v) => update({ accountId: v === ALL ? null : v, instrumentId: null })}>
        <SelectTrigger className="w-full sm:w-56" aria-label="Счёт">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все счета</SelectItem>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.instrumentId ?? ALL} onValueChange={(v) => update({ instrumentId: v === ALL ? null : v })}>
        <SelectTrigger className="w-full sm:w-48" aria-label="Инструмент">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Все инструменты</SelectItem>
          {instruments.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.secid} · {i.shortName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Segmented label="Период" value={value.period} onChange={(period) => update({ period })} options={PERIODS} className="no-scrollbar max-w-full min-w-0 overflow-x-auto" />
      {value.period === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="С даты" className="w-40" defaultValue={value.from} onChange={(e) => update({ from: e.target.value })} />
          <span className="text-muted-foreground">—</span>
          <Input type="date" aria-label="По дату" className="w-40" defaultValue={value.to} onChange={(e) => update({ to: e.target.value })} />
        </div>
      )}
      {pending && <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" />}
      <Segmented
        label="Вид"
        value={value.view}
        onChange={(view) => update({ view })}
        className="ml-auto"
        options={[
          { value: "charts", label: <span className="inline-flex items-center gap-1.5"><ChartColumnIcon className="size-4" /> Графики</span> },
          { value: "table", label: <span className="inline-flex items-center gap-1.5"><TableIcon className="size-4" /> Таблица</span> },
        ]}
      />
    </div>
  );
}

import { visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import Link from "next/link";
import { FileUpIcon, LandmarkIcon, NotebookPenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PeriodPreset } from "@/core/stats";
import { getJournal, listTradedInstruments, listUserAccounts, PERIOD_PRESETS } from "@/server/services/journal";
import { requireUser } from "@/server/session";
import { EquityChart } from "./charts/equity-chart";
import { InstrumentBars } from "./charts/instrument-bars";
import { PnlBars } from "./charts/pnl-bars";
import { PnlCalendar } from "./charts/pnl-calendar";
import { WinLossDonut } from "./charts/win-loss-donut";
import { JournalFilters, type JournalView } from "./journal-filters";
import { StatsCards } from "./stats-cards";
import { TradesTable } from "./trades-table";

export const metadata: Metadata = { title: "Дневник" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  if (visualPreview) return <EmptyJournal />;
  const user = await requireUser();
  const params = await searchParams;
  const accounts = await listUserAccounts(user.id);

  if (accounts.length === 0) return <EmptyJournal />;

  const accountParam = str(params.account);
  const accountId = accounts.some((a) => a.id === accountParam) ? accountParam! : null;
  const periodParam = str(params.period) as PeriodPreset | undefined;
  const period = periodParam && PERIOD_PRESETS.includes(periodParam) ? periodParam : "all";
  const instruments = await listTradedInstruments(user.id, accountId ? [accountId] : accounts.map((a) => a.id));
  const instrumentParam = str(params.instrument);
  const instrumentId = instruments.some((i) => i.id === instrumentParam) ? instrumentParam! : null;

  const view: JournalView = str(params.view) === "table" ? "table" : "charts";
  const data = await getJournal(user.id, accounts, {
    accountId,
    instrumentId,
    period,
    from: str(params.from),
    to: str(params.to),
  });

  return (
    // grid-cols-1 = minmax(0, 1fr): широкие дочерние элементы прокручиваются, а не растягивают страницу на телефоне
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Дневник сделок</h1>
          <p className="text-sm text-muted-foreground">Завершённые сделки (от открытия до закрытия позиции), время — МСК</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/journal/import">
            <FileUpIcon /> Импорт отчёта
          </Link>
        </Button>
      </div>

      <JournalFilters
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        instruments={instruments}
        value={{ accountId, instrumentId, period, from: str(params.from) ?? "", to: str(params.to) ?? "", view }}
      />

      <StatsCards stats={data.stats} equityStart={data.equityStart} equityEnd={data.equityEnd} />

      {view === "table" ? (
        <TradesTable trades={data.trades} showAccount={!accountId && accounts.length > 1} />
      ) : data.trades.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-sm text-muted-foreground">За выбранный период закрытых сделок нет.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <EquityChart data={data.charts.equity} isPnl={data.charts.equityIsPnl} />
          </div>
          <div className="lg:col-span-2">
            <PnlBars charts={data.charts} />
          </div>
          <WinLossDonut stats={data.stats} />
          <div className="lg:col-span-3 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <InstrumentBars rows={data.charts.byInstrument} />
            <PnlCalendar byDay={data.charts.byDay} range={data.range} />
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyJournal() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Дневник сделок</h1>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <NotebookPenIcon className="size-10 text-muted-foreground" />
          <div className="grid gap-1">
            <p className="font-medium">Пока нет сделок</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Загрузите брокерский отчёт (CSV/XLSX) или подключите брокера по API — сделки соберутся автоматически.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/journal/import">
                <FileUpIcon /> Импортировать отчёт
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/account/brokers">
                <LandmarkIcon /> Подключить брокера
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

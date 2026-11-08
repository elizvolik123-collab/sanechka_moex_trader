"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { KeyRoundIcon, LoaderCircleIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTimeMsk } from "@/lib/format";
import { formatNumber } from "@/lib/number";
import type { ConnectionView } from "@/server/services/broker-connections";
import type { SyncStats } from "@/server/services/sync";
import { Input } from "@/components/ui/input";
import { deleteConnectionAction, setAccountEnabledAction, setStartingCapitalAction, syncConnectionAction } from "../actions";

const BROKER_NAMES: Record<ConnectionView["broker"], string> = {
  TINVEST: "Т-Инвестиции",
  FINAM: "Финам",
  ALOR: "Алор",
  FILE: "Импорт из файла",
};

const REFRESH_MS = 4000;

/** Синхронизация идёт или только что поставлена в очередь (подключение без единого запуска). */
function isSyncing(c: ConnectionView) {
  const run = c.syncRuns[0];
  return c.broker !== "FILE" && (run?.status === "RUNNING" || run?.status === "QUEUED" || (!run && !c.lastSyncAt));
}

function StatusBadge({ connection: c }: { connection: ConnectionView }) {
  if (c.broker === "FILE") return null;
  if (isSyncing(c)) return <Badge variant="secondary">Синхронизация…</Badge>;
  if (c.status === "REVOKED") return <Badge variant="destructive">Токен не действует</Badge>;
  if (c.status === "ERROR" || c.lastSyncError) return <Badge variant="destructive">Ошибка</Badge>;
  return <Badge variant="success">Активно</Badge>;
}

function SyncSummary({ connection: c }: { connection: ConnectionView }) {
  const run = c.syncRuns[0];
  if (!run || run.status !== "SUCCESS" || !run.stats) return null;
  const s = run.stats as unknown as SyncStats;
  const skipped = Object.entries(s.skipped ?? {});
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      <p>
        Последняя загрузка: новых сделок (исполнений) — {formatNumber(s.executions, 0)}, денежных операций —{" "}
        {formatNumber(s.cashOps, 0)}, сделок в дневнике по затронутым инструментам — {formatNumber(s.trades, 0)}.
      </p>
      {skipped.length > 0 && (
        <p className="text-amber-700 dark:text-amber-300">
          Не загружены: {skipped.map(([reason, n]) => `${reason} — ${n}`).join("; ")}.
        </p>
      )}
    </div>
  );
}

/** Начальный капитал счёта — база кривой капитала и просадки в процентах. */
function CapitalEditor({ accountId, value }: { accountId: string; value: number | null }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState(value === null ? "" : String(value).replace(".", ","));

  function save(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const result = await setStartingCapitalAction(accountId, draft);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <form onSubmit={save} className="ml-auto flex items-center gap-2">
      <label htmlFor={`cap-${accountId}`} className="text-xs text-muted-foreground">
        Начальный капитал, ₽
      </label>
      <Input
        id={`cap-${accountId}`}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="не задан"
        className="h-8 w-32"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending || draft.trim() === ""}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : "ОК"}
      </Button>
    </form>
  );
}

export function ConnectionCard({ connection }: { connection: ConnectionView }) {
  const router = useRouter();
  const [syncing, startSync] = useTransition();
  const [deleting, startDelete] = useTransition();
  const [toggling, startToggle] = useTransition();
  const [watchUntil, setWatchUntil] = useState(0);
  const running = isSyncing(connection);

  // Пока идёт синхронизация (или только что нажали кнопку) — обновляем страницу, чтобы увидеть результат
  useEffect(() => {
    if (!running && watchUntil === 0) return;
    const id = setInterval(() => {
      if (!running && Date.now() > watchUntil) setWatchUntil(0);
      router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [running, watchUntil, router]);

  function sync() {
    startSync(async () => {
      const result = await syncConnectionAction(connection.id);
      if (result.ok) {
        toast.success(result.message);
        setWatchUntil(Date.now() + 60_000);
      } else {
        toast.error(result.message);
      }
    });
  }

  function remove() {
    startDelete(async () => {
      const result = await deleteConnectionAction(connection.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function toggleAccount(accountId: string, isEnabled: boolean) {
    startToggle(async () => {
      const result = await setAccountEnabledAction(accountId, isEnabled);
      if (!result.ok) toast.error(result.message);
    });
  }

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {connection.label}
          <StatusBadge connection={connection} />
        </CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{BROKER_NAMES[connection.broker]}</span>
          {connection.tokenLast4 && (
            <span className="inline-flex items-center gap-1 font-mono text-xs">
              <KeyRoundIcon className="size-3" />
              ••••{connection.tokenLast4}
            </span>
          )}
        </CardDescription>
        <CardAction className="flex gap-2">
          {connection.broker !== "FILE" && (
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing || running}>
              {syncing || running ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
              <span className="hidden sm:inline">Синхронизировать сейчас</span>
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" aria-label="Удалить подключение" disabled={deleting}>
                {deleting ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить подключение «{connection.label}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  Токен будет удалён, а сделки этого подключения исчезнут из дневника. Действие необратимо.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={remove} className="bg-destructive text-white hover:bg-destructive/90">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[auto_1fr]">
          {connection.broker !== "FILE" && (
            <>
              <dt className="text-muted-foreground">Последняя синхронизация</dt>
              <dd className="tabular">
                {connection.lastSyncAt ? formatDateTimeMsk(connection.lastSyncAt) : running ? "выполняется…" : "ещё не было"}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">{connection.broker === "FILE" ? "Создано" : "Подключено"}</dt>
          <dd className="tabular">{formatDateTimeMsk(connection.createdAt)}</dd>
        </dl>
        {connection.lastSyncError && !running && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{connection.lastSyncError}</p>
        )}
        <SyncSummary connection={connection} />
        {connection.accounts.length > 0 && (
          <div className="grid gap-1">
            <p className="text-muted-foreground">Счета</p>
            <ul className="grid gap-1">
              {connection.accounts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate">{a.name}</div>
                    {a.syncedUntil && (
                      <div className="text-xs text-muted-foreground">операции загружены по {formatDateTimeMsk(a.syncedUntil)}</div>
                    )}
                  </div>
                  {/* key: при новом значении с сервера (после синхронизации) поле пересоздаётся с ним */}
                  <CapitalEditor key={`${a.id}:${a.startingCapital}`} accountId={a.id} value={a.startingCapital} />
                  <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--primary)]"
                      checked={a.isEnabled}
                      disabled={toggling}
                      onChange={(e) => toggleAccount(a.id, e.target.checked)}
                    />
                    в дневнике
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

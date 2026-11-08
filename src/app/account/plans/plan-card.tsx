"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CalculatorIcon, LoaderCircleIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { InstrumentLogo } from "@/components/instrument-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTimeMsk } from "@/lib/format";
import { formatMoney, formatNumber, formatPrice } from "@/lib/number";
import { plural } from "@/lib/plural";
import type { TradePlanView } from "@/server/services/trade-plans";
import { deletePlanAction, setPlanStatusAction } from "./actions";

const STATUS_LABELS = { PLANNED: "Запланирована", EXECUTED: "Исполнена", CANCELLED: "Отменена" } as const;

export function PlanCard({ plan: p }: { plan: TradePlanView }) {
  const [pending, start] = useTransition();
  const pct = p.assetClass === "BOND" ? " %" : "";

  function remove() {
    start(async () => {
      if (await deletePlanAction(p.id)) toast.success("План удалён");
      else toast.error("План не найден");
    });
  }

  function changeStatus(status: string) {
    start(async () => {
      if (!(await setPlanStatusAction(p.id, status))) toast.error("Не удалось изменить статус");
    });
  }

  return (
    <Card className="gap-3 py-4">
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <InstrumentLogo ticker={p.secid} logoName={p.logoName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{p.secid}</span>
              <Badge variant={p.direction === "LONG" ? "success" : "destructive"}>
                {p.direction === "LONG" ? "Лонг" : "Шорт"}
              </Badge>
              <span className="text-sm text-muted-foreground">{p.shortName}</span>
            </div>
            <div className="text-xs text-muted-foreground">{formatDateTimeMsk(p.createdAt)}</div>
          </div>
          <Select value={p.status} onValueChange={changeStatus} disabled={pending}>
            <SelectTrigger className="h-8 w-40" aria-label="Статус плана">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild variant="ghost" size="icon" aria-label="Открыть в калькуляторе">
            <Link href={`/calculator?ticker=${encodeURIComponent(p.secid)}`}>
              <CalculatorIcon />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-label="Удалить план" onClick={remove} disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <Trash2Icon />}
          </Button>
        </div>
        <dl className="tabular grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Item label="Вход" value={`${formatPrice(p.entryPrice, p.decimals)}${pct}`} />
          <Item label="Стоп" value={`${formatPrice(p.stopPrice, p.decimals)}${pct}`} className="text-loss" />
          <Item label={`Тейк (1:${formatNumber(p.rewardRatio)})`} value={`${formatPrice(p.takePrice, p.decimals)}${pct}`} className="text-profit" />
          <Item label="Объём" value={`${p.lots} ${plural(p.lots, ["лот", "лота", "лотов"])}`} />
          <Item label="Риск" value={`−${formatMoney(p.riskRub)}`} className="text-loss" />
          <Item label="Цель" value={`+${formatMoney(p.profitRub)}`} className="text-profit" />
        </dl>
        {p.note && <p className="rounded-md bg-muted px-3 py-2 text-sm">{p.note}</p>}
      </CardContent>
    </Card>
  );
}

function Item({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${className ?? ""}`}>{value}</dd>
    </div>
  );
}

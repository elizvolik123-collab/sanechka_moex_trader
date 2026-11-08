import { calculatePosition, type RiskResult } from "@/core/risk";
import type { TradePlanInput } from "@/lib/validation/plan";
import { db } from "../db";

export type SavePlanResult = { ok: true; id: string } | { ok: false; error: string };

/** Сохраняет план сделки. Расчёт выполняется заново на сервере по спецификации из БД. */
export async function saveTradePlan(userId: string, input: TradePlanInput): Promise<SavePlanResult> {
  const instrument = await db().instrument.findUnique({ where: { id: input.instrumentId } });
  if (!instrument) return { ok: false, error: "Инструмент не найден" };

  const outcome = calculatePosition(
    {
      assetClass: instrument.assetClass,
      lotSize: instrument.lotSize,
      minStep: instrument.minStep.toNumber(),
      stepPrice: instrument.stepPrice?.toNumber(),
      faceValue: instrument.faceValue?.toNumber(),
      initialMargin: instrument.initialMargin?.toNumber(),
      currency: instrument.currency,
    },
    input,
  );
  if (!outcome.ok) return { ok: false, error: Object.values(outcome.errors)[0] ?? "Некорректные параметры" };
  const r: RiskResult = outcome.result;
  if (r.lots < 1) return { ok: false, error: "Размер позиции меньше одного лота — сохранять нечего" };

  const plan = await db().tradePlan.create({
    data: {
      userId,
      instrumentId: instrument.id,
      direction: input.direction,
      depositRub: input.depositRub,
      riskPct: input.riskPct,
      entryPrice: r.entryPrice,
      stopPrice: r.stopPrice,
      takePrice: r.takePrice,
      rewardRatio: input.rewardRatio,
      lots: r.lots,
      riskRub: r.potentialLossRub,
      profitRub: r.potentialProfitRub,
      feesRub: r.commissionRub,
      note: input.note || null,
    },
    select: { id: true },
  });
  return { ok: true, id: plan.id };
}

export async function listTradePlans(userId: string) {
  const rows = await db().tradePlan.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { instrument: { select: { secid: true, shortName: true, decimals: true, assetClass: true, logoName: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    secid: p.instrument.secid,
    shortName: p.instrument.shortName,
    decimals: p.instrument.decimals,
    assetClass: p.instrument.assetClass,
    logoName: p.instrument.logoName,
    direction: p.direction,
    entryPrice: p.entryPrice.toNumber(),
    stopPrice: p.stopPrice.toNumber(),
    takePrice: p.takePrice.toNumber(),
    lots: p.lots,
    riskRub: p.riskRub.toNumber(),
    profitRub: p.profitRub.toNumber(),
    rewardRatio: p.rewardRatio.toNumber(),
    note: p.note,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
  }));
}

export type TradePlanView = Awaited<ReturnType<typeof listTradePlans>>[number];

export async function deleteTradePlan(userId: string, id: string): Promise<boolean> {
  const { count } = await db().tradePlan.deleteMany({ where: { id, userId } });
  return count > 0;
}

export async function setTradePlanStatus(userId: string, id: string, status: "PLANNED" | "EXECUTED" | "CANCELLED") {
  const { count } = await db().tradePlan.updateMany({ where: { id, userId }, data: { status } });
  return count > 0;
}

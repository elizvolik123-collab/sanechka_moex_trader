import { db } from "../db";

export type CalculatorDefaults = {
  depositRub: number;
  riskPct: number;
  rewardRatio: number;
  commissionPct: number;
};

/** Настройки калькулятора; запись создаётся при первом обращении. */
export async function getCalculatorDefaults(userId: string): Promise<CalculatorDefaults> {
  const s = await db().userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  return {
    depositRub: s.depositRub.toNumber(),
    riskPct: s.riskPct.toNumber(),
    rewardRatio: s.rewardRatio.toNumber(),
    commissionPct: s.commissionPct.toNumber(),
  };
}

export async function saveCalculatorDefaults(userId: string, values: CalculatorDefaults) {
  await db().userSettings.upsert({
    where: { userId },
    create: { userId, ...values },
    update: values,
  });
}

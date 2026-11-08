"use server";

import { revalidatePath } from "next/cache";
import { tradePlanSchema } from "@/lib/validation/plan";
import { saveTradePlan } from "@/server/services/trade-plans";
import { getCurrentUser } from "@/server/session";

export type SavePlanState = { ok: boolean; message: string; needLogin?: boolean };

export async function savePlanAction(input: unknown): Promise<SavePlanState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, needLogin: true, message: "Войдите, чтобы сохранять планы сделок" };

  const parsed = tradePlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Некорректные данные" };

  const result = await saveTradePlan(user.id, parsed.data);
  if (!result.ok) return { ok: false, message: result.error };
  revalidatePath("/account/plans");
  return { ok: true, message: "План сделки сохранён в личном кабинете" };
}

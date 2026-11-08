"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { deleteTradePlan, setTradePlanStatus } from "@/server/services/trade-plans";
import { requireUser } from "@/server/session";

export async function deletePlanAction(id: string) {
  const user = await requireUser();
  const ok = await deleteTradePlan(user.id, id);
  revalidatePath("/account/plans");
  return ok;
}

const statusSchema = z.enum(["PLANNED", "EXECUTED", "CANCELLED"]);

export async function setPlanStatusAction(id: string, status: string) {
  const user = await requireUser();
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return false;
  const ok = await setTradePlanStatus(user.id, id, parsed.data);
  revalidatePath("/account/plans");
  return ok;
}

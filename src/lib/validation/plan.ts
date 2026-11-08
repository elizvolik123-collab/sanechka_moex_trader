import { z } from "zod";

const finite = z.number().refine(Number.isFinite, "Некорректное число");

export const tradePlanSchema = z.object({
  instrumentId: z.string().min(1, "Выберите инструмент"),
  direction: z.enum(["LONG", "SHORT"]),
  depositRub: finite,
  riskPct: finite,
  entryPrice: finite,
  stopMode: z.enum(["points", "percent", "price"]),
  stopValue: finite,
  rewardRatio: finite,
  commissionPct: finite.optional(),
  note: z.string().trim().max(500, "Заметка не длиннее 500 символов").optional(),
});

export type TradePlanInput = z.infer<typeof tradePlanSchema>;

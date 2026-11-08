import { z } from "zod";

/** Число из поля ввода: допускает пробелы-разделители тысяч и запятую. */
export const decimalInput = (message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s ]/g, "").replace(",", ".") : v),
    z.coerce.number({ error: message }).refine(Number.isFinite, message),
  );

export const calculatorDefaultsSchema = z.object({
  depositRub: decimalInput("Введите размер счёта").pipe(
    z.number().positive("Размер счёта должен быть больше нуля").max(1e12, "Слишком большое значение"),
  ),
  riskPct: decimalInput("Введите риск на сделку").pipe(
    z.number().gt(0, "Риск должен быть больше 0%").max(100, "Риск не может превышать 100%"),
  ),
  rewardRatio: decimalInput("Введите соотношение").pipe(
    z.number().gt(0, "Соотношение должно быть больше нуля").max(100, "Слишком большое соотношение"),
  ),
  commissionPct: decimalInput("Введите комиссию").pipe(
    z.number().min(0, "Комиссия не может быть отрицательной").max(5, "Комиссия не может превышать 5%"),
  ),
});

export const apiBrokers = ["TINVEST"] as const;

export const brokerConnectionSchema = z
  .object({
    broker: z.enum(apiBrokers, { error: "Выберите брокера" }),
    label: z.string().trim().min(1, "Введите название").max(60, "Название слишком длинное"),
    token: z
      .string()
      .trim()
      .min(20, "Токен слишком короткий")
      .max(512, "Токен слишком длинный")
      .regex(/^\S+$/, "Токен не должен содержать пробелов"),
  })
  .refine((v) => v.broker !== "TINVEST" || v.token.startsWith("t."), {
    path: ["token"],
    message: "Токен T-Invest API начинается с «t.»",
  });

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(80, "Имя слишком длинное"),
});

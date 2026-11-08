import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Введите корректный email"));

export const passwordSchema = z
  .string()
  .min(8, "Пароль должен быть не короче 8 символов")
  .max(128, "Пароль должен быть не длиннее 128 символов");

export const nameSchema = z.string().trim().min(1, "Введите имя").max(80, "Имя слишком длинное");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Введите пароль"),
});

export const signUpSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Пароли не совпадают" });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Пароли не совпадают" });

export type FieldErrors = Record<string, string | undefined>;

/** Ошибки zod → { поле: первое сообщение }. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const result: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}

/** Защита от open redirect: разрешаем только внутренние пути. */
export function safeNextPath(value: unknown, fallback = "/journal"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

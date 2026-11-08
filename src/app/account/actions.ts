"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { brokerConnectionSchema, calculatorDefaultsSchema, decimalInput } from "@/lib/validation/account";
import { toFieldErrors, type FieldErrors } from "@/lib/validation/auth";
import { logger } from "@/server/logger";
import {
  createApiConnection,
  deleteConnection,
  requestSync,
  setAccountEnabled,
  setStartingCapital,
} from "@/server/services/broker-connections";
import { saveCalculatorDefaults } from "@/server/services/user-settings";
import { requireUser } from "@/server/session";

/** values — введённые значения: React сбрасывает форму после action, без них ввод терялся бы при ошибке. */
export type ActionState = { ok?: boolean; message?: string; errors?: FieldErrors; values?: Record<string, string> };

function formValues(formData: FormData, omit: string[] = []): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData) {
    if (typeof value === "string" && !key.startsWith("$") && !omit.includes(key)) values[key] = value;
  }
  return values;
}

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = calculatorDefaultsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values: formValues(formData) };
  await saveCalculatorDefaults(user.id, parsed.data);
  revalidatePath("/account/settings");
  return { ok: true, message: "Настройки сохранены" };
}

export async function addConnectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = brokerConnectionSchema.safeParse(Object.fromEntries(formData));
  // Токен обратно в браузер не возвращаем
  if (!parsed.success) return { errors: toFieldErrors(parsed.error), values: formValues(formData, ["token"]) };
  let result;
  try {
    result = await createApiConnection({ userId: user.id, ...parsed.data });
  } catch (error) {
    logger.error({ err: error, userId: user.id }, "Не удалось создать брокерское подключение");
    return {
      errors: { form: "Не удалось сохранить подключение. Попробуйте ещё раз" },
      values: formValues(formData, ["token"]),
    };
  }
  if (!result.ok) return { errors: { [result.field]: result.message }, values: formValues(formData, ["token"]) };
  revalidatePath("/account/brokers");
  return {
    ok: true,
    message: `Подключено счетов: ${result.accounts}. Загрузка истории операций поставлена в очередь`,
  };
}

const capitalSchema = decimalInput("Введите сумму").pipe(
  z.number().positive("Капитал должен быть больше нуля").max(1e12, "Слишком большое значение"),
);

export async function setStartingCapitalAction(accountId: string, raw: string): Promise<ActionState> {
  const user = await requireUser();
  const parsed = capitalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const ok = await setStartingCapital(user.id, accountId, parsed.data);
  revalidatePath("/account/brokers");
  revalidatePath("/journal");
  return ok ? { ok: true, message: "Начальный капитал сохранён" } : { ok: false, message: "Счёт не найден" };
}

export async function setAccountEnabledAction(accountId: string, isEnabled: boolean): Promise<ActionState> {
  const user = await requireUser();
  const ok = await setAccountEnabled(user.id, accountId, isEnabled);
  revalidatePath("/account/brokers");
  revalidatePath("/journal");
  return ok ? { ok: true } : { ok: false, message: "Счёт не найден" };
}

export async function deleteConnectionAction(connectionId: string): Promise<ActionState> {
  const user = await requireUser();
  const deleted = await deleteConnection(user.id, connectionId);
  revalidatePath("/account/brokers");
  return deleted ? { ok: true, message: "Подключение удалено" } : { ok: false, message: "Подключение не найдено" };
}

const SYNC_MESSAGES = {
  queued: { ok: true, message: "Синхронизация поставлена в очередь" },
  "already-queued": { ok: true, message: "Синхронизация уже выполняется" },
  "not-found": { ok: false, message: "Подключение не найдено" },
  "not-supported": { ok: false, message: "Для импорта из файла синхронизация не нужна" },
} satisfies Record<string, ActionState>;

export async function syncConnectionAction(connectionId: string): Promise<ActionState> {
  const user = await requireUser();
  try {
    const result = await requestSync(user.id, connectionId);
    revalidatePath("/account/brokers");
    return SYNC_MESSAGES[result];
  } catch (error) {
    logger.error({ err: error, connectionId }, "Не удалось поставить синхронизацию в очередь");
    return { ok: false, message: "Очередь задач недоступна. Попробуйте позже" };
  }
}

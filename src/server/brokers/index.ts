import type { BrokerType } from "@/generated/prisma/enums";
import { TInvestAdapter } from "./tinvest/adapter";
import type { BrokerAdapter } from "./types";

export type AdapterMode = "background" | "interactive";

/**
 * Адаптер по типу брокера. Токен передаётся уже расшифрованным и живёт только в памяти.
 * interactive — одна быстрая попытка (проверка токена в форме), background — с повторами (воркер).
 */
export function createBrokerAdapter(broker: BrokerType, token: string, mode: AdapterMode = "background"): BrokerAdapter {
  switch (broker) {
    case "TINVEST":
      return new TInvestAdapter(token, mode === "interactive" ? { maxAttempts: 1, timeoutMs: 15_000 } : undefined);
    // TODO: адаптеры Финам Trade API и Алор OpenAPI
    case "FINAM":
    case "ALOR":
      throw new Error(`Брокер ${broker} пока не поддерживается`);
    case "FILE":
      throw new Error("Для импорта из файла адаптер не нужен");
  }
}

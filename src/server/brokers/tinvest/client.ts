import { BrokerAuthError, BrokerRequestError, BrokerUnavailableError } from "../types";

/**
 * HTTP-клиент REST-прокси T-Invest API (gRPC-gateway): POST JSON на /rest/<сервис>/<метод>.
 * Документация: https://russianinvestments.github.io/investAPI/
 * Адрес меняется через TINVEST_API_URL (например, на песочницу или локальный мок для разработки).
 */

const DEFAULT_URL = "https://invest-public-api.tinkoff.ru/rest";
const PACKAGE = "tinkoff.public.invest.api.contract.v1";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type ClientOptions = {
  /** Попыток на временные ошибки (сеть, 429, 5xx). Для интерактивной проверки токена — 1. */
  maxAttempts?: number;
  timeoutMs?: number;
  baseUrl?: string;
};

export class TInvestClient {
  private readonly baseUrl: string;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly token: string,
    options: ClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? (process.env.TINVEST_API_URL || DEFAULT_URL)).replace(/\/$/, "");
    this.maxAttempts = options.maxAttempts ?? 4;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async call<T>(service: string, method: string, body: object): Promise<T> {
    const url = `${this.baseUrl}/${PACKAGE}.${service}/${method}`;
    const MAX_ATTEMPTS = this.maxAttempts;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-app-name": "moex-trader",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      if (response.ok) return (await response.json()) as T;
      if (response.status === 401) throw new BrokerAuthError();
      if (response.status === 403) {
        throw new BrokerRequestError("Токену не хватает прав на этот счёт. Нужен токен с доступом на чтение ко всем счетам", 403);
      }
      if (response.status === 429 || response.status >= 500) {
        // Лимит запросов или временный сбой: ждём (x-ratelimit-reset — секунды до сброса лимита) и повторяем
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        lastError = new Error(`HTTP ${response.status}`);
        if (attempt < MAX_ATTEMPTS) await sleep(Number.isFinite(reset) && reset > 0 ? Math.min(reset, 60) * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      throw new BrokerRequestError(`T-Invest API: ${method} вернул HTTP ${response.status}`, response.status);
    }
    throw new BrokerUnavailableError("T-Invest API недоступен. Синхронизация будет повторена автоматически", lastError);
  }
}

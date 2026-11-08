import type { AssetClass } from "@/core/risk";

/**
 * Общий интерфейс брокерских API. Новый брокер (Финам, Алор…) = новая реализация BrokerAdapter;
 * синхронизация, сборка сделок и статистика от брокера не зависят.
 */

export type BrokerAccountInfo = {
  externalId: string;
  name: string;
  openedAt: Date | null;
  closed: boolean;
};

/** Ссылка на инструмент в терминах брокера. */
export type BrokerInstrumentRef = {
  uid: string | null;
  figi: string | null;
  ticker: string | null;
  classCode: string | null;
};

export type ExecutionDto = {
  /** Стабильный id исполнения (биржевой номер сделки), ключ идемпотентности */
  externalId: string;
  instrument: BrokerInstrumentRef;
  side: "BUY" | "SELL";
  executedAt: Date;
  /** Цена за штуку в валюте расчётов (у облигаций — деньгами, а не в % — пересчитывается при сохранении) */
  price: number;
  quantity: number;
  brokerFee: number;
  accruedInterest: number | null;
  currency: string;
};

export type CashOpType = "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "COUPON" | "AMORTIZATION" | "VARMARGIN" | "TAX" | "FEE" | "OTHER";

export type CashOpDto = {
  externalId: string;
  type: CashOpType;
  /** Со знаком: + поступление, − списание */
  amount: number;
  currency: string;
  occurredAt: Date;
  instrument: BrokerInstrumentRef | null;
  description: string | null;
};

export type OperationsBatch = {
  executions: ExecutionDto[];
  cashOps: CashOpDto[];
  /** Пропущенные операции: тип → количество (переводы бумаг, экспирации, валютные инструменты…) */
  skipped: Record<string, number>;
};

export type BrokerInstrumentInfo = {
  uid: string;
  figi: string | null;
  ticker: string;
  /** Режим торгов в терминах MOEX (TQBR, RFUD…) */
  board: string;
  isin: string | null;
  name: string;
  assetClass: AssetClass;
  lotSize: number;
  minStep: number;
  stepPrice: number | null;
  faceValue: number | null;
  initialMargin: number | null;
  currency: string;
  logoName: string | null;
};

export interface BrokerAdapter {
  listAccounts(): Promise<BrokerAccountInfo[]>;
  /** Все исполненные операции счёта за период (пагинация — внутри адаптера). */
  fetchOperations(accountExternalId: string, from: Date, to: Date): Promise<OperationsBatch>;
  getInstrument(ref: BrokerInstrumentRef): Promise<BrokerInstrumentInfo | null>;
}

/** Токен не принят брокером (401) — повторять бессмысленно, нужен новый токен. */
export class BrokerAuthError extends Error {
  constructor(message = "Токен недействителен или отозван. Создайте новый токен и подключите счёт заново") {
    super(message);
    this.name = "BrokerAuthError";
  }
}

/** Временная ошибка (сеть, лимиты, 5xx) — задачу стоит повторить позже. */
export class BrokerUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "BrokerUnavailableError";
  }
}

export class BrokerRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "BrokerRequestError";
  }
}

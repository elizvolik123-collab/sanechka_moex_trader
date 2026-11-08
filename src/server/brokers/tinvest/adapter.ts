import type { BrokerAccountInfo, BrokerAdapter, BrokerInstrumentInfo, BrokerInstrumentRef, OperationsBatch } from "../types";
import { BrokerRequestError } from "../types";
import { TInvestClient, type ClientOptions } from "./client";
import { mapAccount, mapInstrument, mapOperations, toDecimal, type ApiAccount, type ApiInstrument, type ApiOperation, type MoneyValue, type Quotation } from "./mapping";

const PAGE_LIMIT = 1000;
const MAX_PAGES = 1000;

/** Адаптер T-Invest API: только методы чтения (счета, операции, инструменты). */
export class TInvestAdapter implements BrokerAdapter {
  private readonly client: TInvestClient;

  constructor(token: string, options?: ClientOptions) {
    this.client = new TInvestClient(token, options);
  }

  async listAccounts(): Promise<BrokerAccountInfo[]> {
    const res = await this.client.call<{ accounts?: ApiAccount[] }>("UsersService", "GetAccounts", {
      status: "ACCOUNT_STATUS_ALL",
    });
    return (res.accounts ?? []).map(mapAccount);
  }

  async fetchOperations(accountExternalId: string, from: Date, to: Date): Promise<OperationsBatch> {
    const items: ApiOperation[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.client.call<{ hasNext?: boolean; nextCursor?: string; items?: ApiOperation[] }>(
        "OperationsService",
        "GetOperationsByCursor",
        {
          accountId: accountExternalId,
          from: from.toISOString(),
          to: to.toISOString(),
          limit: PAGE_LIMIT,
          state: "OPERATION_STATE_EXECUTED",
          withoutCommissions: false,
          withoutTrades: false,
          withoutOvernights: false,
          ...(cursor ? { cursor } : {}),
        },
      );
      items.push(...(res.items ?? []));
      if (!res.hasNext || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return mapOperations(items);
  }

  async getInstrument(ref: BrokerInstrumentRef): Promise<BrokerInstrumentInfo | null> {
    const request = ref.uid
      ? { idType: "INSTRUMENT_ID_TYPE_UID", id: ref.uid }
      : ref.figi
        ? { idType: "INSTRUMENT_ID_TYPE_FIGI", id: ref.figi }
        : ref.ticker && ref.classCode
          ? { idType: "INSTRUMENT_ID_TYPE_TICKER", id: ref.ticker, classCode: ref.classCode }
          : null;
    if (!request) return null;

    let instrument: ApiInstrument | undefined;
    try {
      instrument = (await this.client.call<{ instrument?: ApiInstrument }>("InstrumentsService", "GetInstrumentBy", request)).instrument;
    } catch (error) {
      if (error instanceof BrokerRequestError && (error.status === 404 || error.status === 400)) return null;
      throw error;
    }
    if (!instrument) return null;

    const base = mapInstrument(instrument);
    if (base.assetClass === "BOND") {
      const bond = await this.client.call<{ instrument?: { nominal?: MoneyValue } }>("InstrumentsService", "BondBy", {
        idType: "INSTRUMENT_ID_TYPE_UID",
        id: instrument.uid,
      });
      return mapInstrument(instrument, { faceValue: bond.instrument?.nominal ? toDecimal(bond.instrument.nominal).toNumber() : null });
    }
    if (base.assetClass === "FUTURE") {
      const margin = await this.client.call<{ minPriceIncrementAmount?: Quotation; initialMarginOnBuy?: MoneyValue }>(
        "InstrumentsService",
        "GetFuturesMargin",
        { instrumentId: instrument.uid },
      );
      return mapInstrument(instrument, {
        stepPrice: margin.minPriceIncrementAmount ? toDecimal(margin.minPriceIncrementAmount).toNumber() : null,
        initialMargin: margin.initialMarginOnBuy ? toDecimal(margin.initialMarginOnBuy).toNumber() : null,
      });
    }
    return base;
  }
}

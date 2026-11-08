import Decimal from "decimal.js";
import type { AssetClass, Direction } from "./risk";

/**
 * Сборка завершённых сделок (round-trip) из исполнений методом FIFO.
 *
 * Сделка — цикл позиции от нуля до нуля: добавления к позиции входят в ту же сделку, частичные закрытия
 * сопоставляются с самыми ранними открытыми лотами (FIFO). Если исполнение переворачивает позицию,
 * текущая сделка закрывается, а остаток открывает новую сделку в обратную сторону.
 *
 * Комиссии: все комиссии исполнений входа и выхода относятся к сделке; при перевороте комиссия
 * исполнения делится между сделками пропорционально количеству.
 */

export type FifoExecution = {
  id: string;
  side: "BUY" | "SELL";
  executedAt: Date;
  /** Цена за штуку (облигации — % от номинала, фьючерсы — пункты) */
  price: number;
  /** Количество в штуках (фьючерсы — в контрактах) */
  quantity: number;
  /** Комиссии брокера и биржи по исполнению, ₽ (положительное число) */
  fees: number;
  /** НКД по исполнению целиком, ₽ */
  accruedInterest?: number | null;
};

export type InstrumentValue = {
  assetClass: AssetClass;
  minStep?: number | null;
  stepPrice?: number | null;
  faceValue?: number | null;
};

/**
 * Рублей P&L на 1 штуку при изменении цены на 1:
 * акции/фонды/валюта — 1; облигации — номинал / 100; фьючерсы — стоимость шага / шаг цены.
 */
export function pointValue(instrument: InstrumentValue): Decimal {
  switch (instrument.assetClass) {
    case "BOND":
      return new Decimal(instrument.faceValue ?? 1000).div(100);
    case "FUTURE":
      if (!instrument.minStep || !instrument.stepPrice) throw new Error("Для фьючерса нужны шаг цены и его стоимость");
      return new Decimal(instrument.stepPrice).div(instrument.minStep);
    default:
      return new Decimal(1);
  }
}

export type TradeLegResult = { executionId: string; role: "ENTRY" | "EXIT"; quantity: number; feeShare: number };

export type TradeResult = {
  direction: Direction;
  openedAt: Date;
  closedAt: Date;
  /** Исполнение, открывшее сделку — основа стабильного id сделки */
  firstExecutionId: string;
  /** Суммарный объём входа, шт. */
  quantity: number;
  avgEntry: number;
  avgExit: number;
  fees: number;
  grossPnl: number;
  netPnl: number;
  /** Доходность от стоимости входа, % */
  returnPct: number;
  holdingSec: number;
  legs: TradeLegResult[];
};

export type OpenPosition = {
  direction: Direction;
  quantity: number;
  avgPrice: number;
  openedAt: Date;
};

type Lot = { qty: Decimal; price: Decimal; aiPerUnit: Decimal };

type Cycle = {
  direction: Direction;
  openedAt: Date;
  firstExecutionId: string;
  entryQty: Decimal;
  entryValue: Decimal;
  exitQty: Decimal;
  exitValue: Decimal;
  fees: Decimal;
  gross: Decimal;
  legs: Map<string, { executionId: string; role: "ENTRY" | "EXIT"; qty: Decimal; fee: Decimal }>;
};

function addLeg(cycle: Cycle, executionId: string, role: "ENTRY" | "EXIT", qty: Decimal, fee: Decimal) {
  const key = `${role}:${executionId}`;
  const leg = cycle.legs.get(key);
  if (leg) {
    leg.qty = leg.qty.add(qty);
    leg.fee = leg.fee.add(fee);
  } else {
    cycle.legs.set(key, { executionId, role, qty, fee });
  }
}

const num = (d: Decimal, dp: number) => d.toDecimalPlaces(dp).toNumber();

/** Исполнения должны относиться к одному счёту и одному инструменту. Порядок — хронологический. */
export function buildTrades(
  executions: readonly FifoExecution[],
  instrument: InstrumentValue,
): { trades: TradeResult[]; open: OpenPosition | null } {
  const pv = pointValue(instrument);
  const sorted = [...executions].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());

  const trades: TradeResult[] = [];
  const lots: Lot[] = [];
  let cycle: Cycle | null = null;

  const startCycle = (e: FifoExecution): Cycle => ({
    direction: e.side === "BUY" ? "LONG" : "SHORT",
    openedAt: e.executedAt,
    firstExecutionId: e.id,
    entryQty: new Decimal(0),
    entryValue: new Decimal(0),
    exitQty: new Decimal(0),
    exitValue: new Decimal(0),
    fees: new Decimal(0),
    gross: new Decimal(0),
    legs: new Map(),
  });

  const enter = (c: Cycle, e: FifoExecution, qty: Decimal, feePerUnit: Decimal, aiPerUnit: Decimal) => {
    const price = new Decimal(e.price);
    lots.push({ qty, price, aiPerUnit });
    c.entryQty = c.entryQty.add(qty);
    c.entryValue = c.entryValue.add(price.mul(qty));
    const fee = feePerUnit.mul(qty);
    c.fees = c.fees.add(fee);
    addLeg(c, e.id, "ENTRY", qty, fee);
  };

  const close = (c: Cycle, closedAt: Date) => {
    const net = c.gross.sub(c.fees);
    const cost = c.entryValue.mul(pv);
    trades.push({
      direction: c.direction,
      openedAt: c.openedAt,
      closedAt,
      firstExecutionId: c.firstExecutionId,
      quantity: num(c.entryQty, 6),
      avgEntry: num(c.entryValue.div(c.entryQty), 9),
      avgExit: num(c.exitValue.div(c.exitQty), 9),
      fees: num(c.fees, 4),
      grossPnl: num(c.gross, 4),
      netPnl: num(net, 4),
      returnPct: cost.isZero() ? 0 : num(net.div(cost).mul(100), 6),
      holdingSec: Math.round((closedAt.getTime() - c.openedAt.getTime()) / 1000),
      legs: [...c.legs.values()].map((l) => ({
        executionId: l.executionId,
        role: l.role,
        quantity: num(l.qty, 6),
        feeShare: num(l.fee, 4),
      })),
    });
  };

  for (const e of sorted) {
    if (!(e.quantity > 0)) throw new Error(`Исполнение ${e.id}: количество должно быть больше нуля`);
    const qty = new Decimal(e.quantity);
    const feePerUnit = new Decimal(Math.abs(e.fees)).div(qty);
    const aiPerUnit = new Decimal(Math.abs(e.accruedInterest ?? 0)).div(qty);
    let remaining = qty;

    if (!cycle) cycle = startCycle(e);
    const adding = (cycle.direction === "LONG") === (e.side === "BUY");

    if (adding) {
      enter(cycle, e, remaining, feePerUnit, aiPerUnit);
      continue;
    }

    // Закрытие по FIFO: с самых ранних лотов
    const sign = cycle.direction === "LONG" ? 1 : -1;
    const exitPrice = new Decimal(e.price);
    while (remaining.gt(0) && lots.length > 0) {
      const lot = lots[0];
      const m = Decimal.min(remaining, lot.qty);
      const pricePnl = exitPrice.sub(lot.price).mul(m).mul(pv);
      // НКД: при лонге платим при покупке и получаем при продаже, при шорте — наоборот
      const aiPnl = aiPerUnit.sub(lot.aiPerUnit).mul(m);
      cycle.gross = cycle.gross.add(pricePnl.add(aiPnl).mul(sign));
      cycle.exitQty = cycle.exitQty.add(m);
      cycle.exitValue = cycle.exitValue.add(exitPrice.mul(m));
      const fee = feePerUnit.mul(m);
      cycle.fees = cycle.fees.add(fee);
      addLeg(cycle, e.id, "EXIT", m, fee);
      lot.qty = lot.qty.sub(m);
      remaining = remaining.sub(m);
      if (lot.qty.isZero()) lots.shift();
    }

    if (lots.length === 0) {
      close(cycle, e.executedAt);
      cycle = null;
      // Переворот: остаток исполнения открывает новую сделку в обратную сторону
      if (remaining.gt(0)) {
        cycle = startCycle(e);
        enter(cycle, e, remaining, feePerUnit, aiPerUnit);
      }
    }
  }

  let open: OpenPosition | null = null;
  if (cycle && lots.length > 0) {
    const qty = lots.reduce((s, l) => s.add(l.qty), new Decimal(0));
    const value = lots.reduce((s, l) => s.add(l.qty.mul(l.price)), new Decimal(0));
    open = { direction: cycle.direction, quantity: num(qty, 6), avgPrice: num(value.div(qty), 9), openedAt: cycle.openedAt };
  }
  return { trades, open };
}

import Decimal from "decimal.js";

/**
 * Калькулятор риск- и мани-менеджмента. Чистые функции, вся арифметика — decimal.js.
 *
 * Термины:
 *  - шаг цены (minStep) — минимальное изменение цены;
 *  - стоимость шага на 1 лот — сколько рублей приносит/теряет 1 лот при движении цены на 1 шаг:
 *      акции, фонды, валюта: minStep × лотность;
 *      облигации (цена в % от номинала): minStep / 100 × номинал × лотность;
 *      фьючерсы: стоимость шага из спецификации биржи (лот = 1 контракт);
 *  - люфт — расстояние от цены входа до стоп-лосса.
 */

export type AssetClass = "SHARE" | "BOND" | "ETF" | "FUTURE" | "CURRENCY" | "OTHER";
export type Direction = "LONG" | "SHORT";
export type StopMode = "points" | "percent" | "price";

export type InstrumentParams = {
  assetClass: AssetClass;
  lotSize: number;
  minStep: number;
  /** Стоимость шага цены, ₽ (обязательна для фьючерсов) */
  stepPrice?: number | null;
  /** Номинал (обязателен для облигаций) */
  faceValue?: number | null;
  /** Гарантийное обеспечение на 1 контракт, ₽ (фьючерсы) */
  initialMargin?: number | null;
  /** Валюта номинала/цены; расчёт ведётся в рублях */
  currency?: string;
};

export type RiskInput = {
  depositRub: number;
  riskPct: number;
  direction: Direction;
  entryPrice: number;
  stopMode: StopMode;
  /** Пункты (в единицах цены), проценты от цены входа или цена стопа — в зависимости от stopMode */
  stopValue: number;
  /** Соотношение прибыль/риск: 3 означает 1:3 */
  rewardRatio: number;
  /** Комиссия, % от оборота за одну сторону сделки (вход или выход) */
  commissionPct?: number;
};

export type RiskField = keyof RiskInput | "instrument";

export type RiskWarning =
  | { code: "ZERO_LOTS"; riskPerLot: number; riskRub: number }
  | { code: "LEVERAGE"; leverage: number }
  | { code: "MARGIN_EXCEEDS_DEPOSIT"; marginRequired: number }
  | { code: "ONE_CONTRACT_MARGIN_EXCEEDS_DEPOSIT"; initialMargin: number }
  | { code: "NO_MARGIN_DATA" }
  | { code: "FOREIGN_CURRENCY"; currency: string }
  | { code: "PRICE_ROUNDED"; field: "entryPrice" | "stopPrice" };

export type RiskResult = {
  riskRub: number;
  entryPrice: number;
  stopPrice: number;
  takePrice: number;
  /** Люфт в единицах цены и в шагах цены */
  stopDistance: number;
  stopSteps: number;
  takeDistance: number;
  stepValuePerLot: number;
  /** Убыток на 1 лот при срабатывании стопа, включая комиссии */
  riskPerLot: number;
  lots: number;
  quantity: number;
  /** Сумма позиции по цене входа (для фьючерсов — номинальная стоимость контрактов) */
  positionValue: number;
  /** Доля позиции от счёта, % (для фьючерсов — доля ГО от счёта) */
  depositSharePct: number;
  /** Требуемое ГО (фьючерсы) */
  marginRequired: number | null;
  leverage: number;
  commissionRub: number;
  potentialLossRub: number;
  potentialProfitRub: number;
  /** Фактический риск от счёта после округления до целых лотов, % */
  actualRiskPct: number;
  warnings: RiskWarning[];
};

export type RiskOutcome = { ok: true; result: RiskResult } | { ok: false; errors: Partial<Record<RiskField, string>> };

const D = (v: Decimal.Value) => new Decimal(v);

/** Округление цены до шага цены инструмента. */
export function roundToStep(price: Decimal.Value, step: Decimal.Value, mode: Decimal.Rounding = Decimal.ROUND_HALF_UP): Decimal {
  const s = D(step);
  return D(price).div(s).toDecimalPlaces(0, mode).mul(s);
}

/** Стоимость одного шага цены на 1 лот в рублях. */
export function stepValuePerLot(instrument: InstrumentParams): Decimal {
  const step = D(instrument.minStep);
  switch (instrument.assetClass) {
    case "FUTURE":
      return D(instrument.stepPrice ?? 0).mul(instrument.lotSize || 1);
    case "BOND":
      return step.div(100).mul(instrument.faceValue ?? 0).mul(instrument.lotSize);
    default:
      return step.mul(instrument.lotSize);
  }
}

/** Стоимость 1 лота по цене price в рублях (для фьючерсов — номинал контракта). */
export function lotValue(instrument: InstrumentParams, price: Decimal.Value): Decimal {
  const p = D(price);
  switch (instrument.assetClass) {
    case "FUTURE":
      return p.div(instrument.minStep).mul(instrument.stepPrice ?? 0).mul(instrument.lotSize || 1);
    case "BOND":
      return p.div(100).mul(instrument.faceValue ?? 0).mul(instrument.lotSize);
    default:
      return p.mul(instrument.lotSize);
  }
}

function validate(instrument: InstrumentParams, input: RiskInput) {
  const errors: Partial<Record<RiskField, string>> = {};
  const finite = (v: number) => typeof v === "number" && Number.isFinite(v);

  if (!finite(instrument.minStep) || instrument.minStep <= 0 || !finite(instrument.lotSize) || instrument.lotSize <= 0) {
    errors.instrument = "У инструмента нет шага цены или лотности";
  } else if (instrument.assetClass === "FUTURE" && !(instrument.stepPrice && instrument.stepPrice > 0)) {
    errors.instrument = "Для фьючерса нужна стоимость шага цены";
  } else if (instrument.assetClass === "BOND" && !(instrument.faceValue && instrument.faceValue > 0)) {
    errors.instrument = "Для облигации нужен номинал";
  }

  if (!finite(input.depositRub) || input.depositRub <= 0) errors.depositRub = "Размер счёта должен быть больше нуля";
  if (!finite(input.riskPct) || input.riskPct <= 0) errors.riskPct = "Риск должен быть больше 0%";
  else if (input.riskPct > 100) errors.riskPct = "Риск не может превышать 100%";
  if (!finite(input.entryPrice) || input.entryPrice <= 0) errors.entryPrice = "Цена входа должна быть больше нуля";
  if (!finite(input.stopValue) || input.stopValue <= 0) errors.stopValue = "Укажите расстояние до стопа";
  if (!finite(input.rewardRatio) || input.rewardRatio <= 0) errors.rewardRatio = "Соотношение должно быть больше нуля";
  if (input.commissionPct !== undefined && (!finite(input.commissionPct) || input.commissionPct < 0 || input.commissionPct > 5)) {
    errors.commissionPct = "Комиссия должна быть от 0 до 5%";
  }
  return errors;
}

/** Цена стопа из люфта (до округления до шага). */
function rawStopPrice(input: RiskInput): Decimal {
  const entry = D(input.entryPrice);
  const sign = input.direction === "LONG" ? -1 : 1;
  switch (input.stopMode) {
    case "points":
      return entry.add(D(input.stopValue).mul(sign));
    case "percent":
      return entry.mul(D(1).add(D(input.stopValue).div(100).mul(sign)));
    case "price":
      return D(input.stopValue);
  }
}

export function calculatePosition(instrument: InstrumentParams, input: RiskInput): RiskOutcome {
  const errors = validate(instrument, input);
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const long = input.direction === "LONG";
  const step = D(instrument.minStep);
  const warnings: RiskWarning[] = [];

  // Цены должны лежать на сетке шага: вход — до ближайшего шага,
  // стоп — дальше от входа (риск не превысит заданный), тейк — ближе ко входу (консервативно)
  const entry = roundToStep(input.entryPrice, step);
  if (!entry.eq(input.entryPrice)) warnings.push({ code: "PRICE_ROUNDED", field: "entryPrice" });
  if (entry.lte(0)) return { ok: false, errors: { entryPrice: "Цена входа меньше шага цены" } };

  const rawStop = rawStopPrice(input);
  const stop = roundToStep(rawStop, step, long ? Decimal.ROUND_FLOOR : Decimal.ROUND_CEIL);
  if (input.stopMode === "price" && !stop.eq(rawStop)) warnings.push({ code: "PRICE_ROUNDED", field: "stopPrice" });

  if (long && stop.gte(entry)) return { ok: false, errors: { stopValue: "Для лонга стоп должен быть ниже цены входа" } };
  if (!long && stop.lte(entry)) return { ok: false, errors: { stopValue: "Для шорта стоп должен быть выше цены входа" } };
  if (stop.lte(0)) return { ok: false, errors: { stopValue: "Стоп получается не выше нуля — уменьшите люфт" } };

  const stopDistance = entry.sub(stop).abs();
  const stopSteps = stopDistance.div(step);
  const takeDistanceRaw = stopDistance.mul(input.rewardRatio);
  const take = roundToStep(
    long ? entry.add(takeDistanceRaw) : entry.sub(takeDistanceRaw),
    step,
    long ? Decimal.ROUND_FLOOR : Decimal.ROUND_CEIL,
  );
  if (take.lte(0)) return { ok: false, errors: { rewardRatio: "Тейк-профит получается не выше нуля — уменьшите R:R" } };
  const takeDistance = take.sub(entry).abs();

  const stepValue = stepValuePerLot(instrument);
  const commissionRate = D(input.commissionPct ?? 0).div(100);
  const entryLotValue = lotValue(instrument, entry);
  const feeEntry = entryLotValue.mul(commissionRate);
  const feeAtStop = lotValue(instrument, stop).mul(commissionRate);
  const feeAtTake = lotValue(instrument, take).mul(commissionRate);

  const riskRub = D(input.depositRub).mul(input.riskPct).div(100);
  const riskPerLot = stopSteps.mul(stepValue).add(feeEntry).add(feeAtStop);
  const lots = riskRub.div(riskPerLot).floor();
  const quantity = lots.mul(instrument.lotSize);

  const positionValue = entryLotValue.mul(lots);
  const potentialLoss = riskPerLot.mul(lots);
  const potentialProfit = takeDistance.div(step).mul(stepValue).sub(feeEntry).sub(feeAtTake).mul(lots);
  const commission = feeEntry.add(feeAtStop).mul(lots);
  const deposit = D(input.depositRub);

  let marginRequired: Decimal | null = null;
  let depositShare: Decimal;
  let leverage = positionValue.div(deposit);

  if (instrument.assetClass === "FUTURE") {
    if (instrument.initialMargin && instrument.initialMargin > 0) {
      marginRequired = D(instrument.initialMargin).mul(lots);
      depositShare = marginRequired.div(deposit).mul(100);
      if (D(instrument.initialMargin).gt(deposit)) {
        warnings.push({ code: "ONE_CONTRACT_MARGIN_EXCEEDS_DEPOSIT", initialMargin: instrument.initialMargin });
      } else if (marginRequired.gt(deposit)) {
        warnings.push({ code: "MARGIN_EXCEEDS_DEPOSIT", marginRequired: marginRequired.toNumber() });
      }
    } else {
      depositShare = positionValue.div(deposit).mul(100);
      warnings.push({ code: "NO_MARGIN_DATA" });
    }
  } else {
    depositShare = positionValue.div(deposit).mul(100);
    if (positionValue.gt(deposit)) warnings.push({ code: "LEVERAGE", leverage: leverage.toDecimalPlaces(2).toNumber() });
  }
  if (lots.isZero()) {
    warnings.push({ code: "ZERO_LOTS", riskPerLot: riskPerLot.toDecimalPlaces(2).toNumber(), riskRub: riskRub.toNumber() });
    leverage = D(0);
  }
  if (instrument.currency && instrument.currency !== "RUB") {
    warnings.push({ code: "FOREIGN_CURRENCY", currency: instrument.currency });
  }

  const n = (d: Decimal, dp = 2) => d.toDecimalPlaces(dp).toNumber();
  return {
    ok: true,
    result: {
      riskRub: n(riskRub),
      entryPrice: entry.toNumber(),
      stopPrice: stop.toNumber(),
      takePrice: take.toNumber(),
      stopDistance: stopDistance.toNumber(),
      stopSteps: n(stopSteps, 4),
      takeDistance: takeDistance.toNumber(),
      stepValuePerLot: n(stepValue, 6),
      riskPerLot: n(riskPerLot),
      lots: lots.toNumber(),
      quantity: quantity.toNumber(),
      positionValue: n(positionValue),
      depositSharePct: n(depositShare),
      marginRequired: marginRequired ? n(marginRequired) : null,
      leverage: n(leverage),
      commissionRub: n(commission),
      potentialLossRub: n(potentialLoss),
      potentialProfitRub: n(potentialProfit),
      actualRiskPct: n(potentialLoss.div(deposit).mul(100), 3),
      warnings,
    },
  };
}

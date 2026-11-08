export const ASSET_CLASS_LABELS = {
  SHARE: "Акция",
  ETF: "Фонд",
  BOND: "Облигация",
  FUTURE: "Фьючерс",
  CURRENCY: "Валюта",
  OTHER: "Другое",
} as const;

export type AssetClassKey = keyof typeof ASSET_CLASS_LABELS;

import type { InstrumentDto } from "@/server/services/instruments";
import type { CalculatorDefaults } from "@/server/services/user-settings";

export const visualPreview = process.env.NEXT_PUBLIC_VISUAL_PREVIEW === "1";

export const previewUser = { id: "preview", name: "Демо-трейдер", email: "demo@example.test" };
export const previewDefaults: CalculatorDefaults = { depositRub: 100_000, riskPct: 1, rewardRatio: 3, commissionPct: 0.05 };
export const previewInstrument: InstrumentDto = {
  id: "demo-sber", secid: "SBER", board: "TQBR", assetClass: "SHARE",
  shortName: "Сбербанк", name: "Сбербанк", currency: "RUB", lotSize: 10,
  minStep: 0.01, stepPrice: null, faceValue: null, initialMargin: null,
  expiresAt: null, decimals: 2, prevPrice: 300, prevPriceDate: null,
  specUpdatedAt: "2026-01-01T00:00:00Z", logoName: null,
};

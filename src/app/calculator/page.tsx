import { previewInstrument, visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import { db } from "@/server/db";
import { findInstrumentByTicker, getInstrument, type InstrumentDto } from "@/server/services/instruments";
import { getCalculatorDefaults, type CalculatorDefaults } from "@/server/services/user-settings";
import { getCurrentUser } from "@/server/session";
import { Calculator } from "./calculator";

export const metadata: Metadata = { title: "Калькулятор позиции" };

const GUEST_DEFAULTS: CalculatorDefaults = { depositRub: 100_000, riskPct: 1, rewardRatio: 3, commissionPct: 0.05 };

export default async function CalculatorPage({ searchParams }: PageProps<"/calculator">) {
  const { ticker, board } = await searchParams;
  const user = await getCurrentUser();

  const [defaults, initialInstrument, catalogCount] = visualPreview ? [GUEST_DEFAULTS, previewInstrument, 1] as const : await Promise.all([
    user ? getCalculatorDefaults(user.id) : GUEST_DEFAULTS,
    typeof ticker === "string" && ticker ? resolveInstrument(ticker, typeof board === "string" ? board : undefined) : null,
    db().instrument.count({ where: { isTraded: true } }),
  ]);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Калькулятор позиции</h1>
        <p className="text-sm text-muted-foreground">
          Размер позиции по риску, стоп-лосс и тейк-профит для акций, облигаций, фьючерсов и валюты Мосбиржи
        </p>
      </div>
      <Calculator
        defaults={defaults}
        initialInstrument={initialInstrument}
        isLoggedIn={Boolean(user)}
        catalogEmpty={catalogCount === 0}
      />
    </div>
  );
}

async function resolveInstrument(ticker: string, board?: string): Promise<InstrumentDto | null> {
  if (board) {
    const exact = await db().instrument.findUnique({ where: { secid_board: { secid: ticker, board } }, select: { id: true } });
    if (exact) return getInstrument(exact.id);
  }
  return findInstrumentByTicker(ticker);
}

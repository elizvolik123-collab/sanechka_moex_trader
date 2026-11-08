import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { getQuote } from "@/server/services/instruments";

/** Последняя котировка инструмента из MOEX ISS: GET /api/quotes/:instrumentId */
export async function GET(request: Request, { params }: RouteContext<"/api/quotes/[id]">) {
  const limited = rateLimit(request, "quotes", 60);
  if (limited) return limited;
  const { id } = await params;
  const instrument = await db().instrument.findUnique({ where: { id }, select: { board: true, secid: true } });
  if (!instrument) return NextResponse.json({ ok: false, error: "Инструмент не найден" }, { status: 404 });
  const quote = await getQuote(instrument);
  return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
}

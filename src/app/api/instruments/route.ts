import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/server/rate-limit";
import { searchInstruments } from "@/server/services/instruments";

/** Автодополнение инструментов: GET /api/instruments?q=сбер */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "instruments", 120);
  if (limited) return limited;
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  if (q.length < 1) return NextResponse.json({ items: [] });
  const items = await searchInstruments(q, 12);
  return NextResponse.json({ items });
}

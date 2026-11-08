import { NextResponse } from "next/server";
import { getInstrument } from "@/server/services/instruments";

/** Спецификация инструмента: GET /api/instruments/:id */
export async function GET(_request: Request, { params }: RouteContext<"/api/instruments/[id]">) {
  const { id } = await params;
  const instrument = await getInstrument(id);
  if (!instrument) return NextResponse.json({ error: "Инструмент не найден" }, { status: 404 });
  return NextResponse.json(instrument);
}

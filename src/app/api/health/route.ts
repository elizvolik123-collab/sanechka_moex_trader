import { NextResponse } from "next/server";
import { db } from "@/server/db";

/** Проверка живости для Docker healthcheck и мониторинга: приложение отвечает и база доступна. */
export async function GET() {
  try {
    await db().$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "ok", time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "error", db: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

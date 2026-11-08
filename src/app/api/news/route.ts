import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/server/rate-limit";
import { listNews } from "@/server/services/news";

const int = (v: string | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

/**
 * Лента новостей: GET /api/news?before=<id> (старше), ?since=<id> (новее, для автообновления), &q=<поиск>.
 * Публичная — новости доступны без входа.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, "news", 60);
  if (limited) return limited;
  const p = request.nextUrl.searchParams;
  const items = await listNews({
    before: int(p.get("before")),
    since: int(p.get("since")),
    q: (p.get("q") ?? "").slice(0, 100),
  });
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

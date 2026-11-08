import { getLogo } from "@/server/services/logos";

/** Логотип инструмента из кэша (или CDN T-Invest при первом запросе). */
export async function GET(_request: Request, { params }: RouteContext<"/api/logos/[key]">) {
  const { key } = await params;
  const png = await getLogo(key);
  if (!png) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600" } });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, immutable" },
  });
}

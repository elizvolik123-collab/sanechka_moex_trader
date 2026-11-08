import { NextResponse } from "next/server";
import { readNewsMedia } from "@/server/services/news";

/** Картинка поста из локальной копии; если копии нет — редирект на CDN Telegram. */
export async function GET(_request: Request, { params }: RouteContext<"/api/news/media/[id]">) {
  const { id } = await params;
  const media = await readNewsMedia(id);
  if (!media) return new NextResponse(null, { status: 404 });
  if ("redirect" in media) {
    // Редиректим только на CDN Telegram — не превращаем маршрут в открытый редирект
    const host = URL.canParse(media.redirect) ? new URL(media.redirect).hostname : "";
    if (!/(^|\.)(telesco\.pe|telegram\.org|t\.me)$/.test(host)) return new NextResponse(null, { status: 404 });
    return NextResponse.redirect(media.redirect, 302);
  }
  return new Response(new Uint8Array(media.file), {
    headers: { "Content-Type": media.type, "Cache-Control": "public, max-age=604800, immutable" },
  });
}

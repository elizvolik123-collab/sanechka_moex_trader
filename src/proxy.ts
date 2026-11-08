import { visualPreview } from "@/lib/visual-preview";
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Оптимистичная проверка: без cookie сессии закрытые разделы сразу уводят на вход.
 * Настоящая проверка сессии — в requireUser() рядом с данными.
 */
export function proxy(request: NextRequest) {
  if (visualPreview) {
    if (/^\/api(?:\/|$)/i.test(request.nextUrl.pathname)) {
      return NextResponse.json({ error: "API отключено в режиме просмотра" }, { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new NextResponse(null, { status: 405 });
    }
    return NextResponse.next();
  }
  if (/^\/(journal|account)(?:\/|$)/.test(request.nextUrl.pathname) && !getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

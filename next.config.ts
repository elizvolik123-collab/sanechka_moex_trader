import type { NextConfig } from "next";

/**
 * Заголовки безопасности для всех ответов. Полноценный CSP со скриптами не задаём: Next.js и скрипт темы
 * используют inline-скрипты; ограничиваем то, что безопасно запретить всегда.
 * HSTS выставляет Caddy (только там известно, что соединение — HTTPS).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // Cache Components выключены: почти все страницы персональные и рендерятся по запросу.
  cacheComponents: false,
  output: "standalone",
  poweredByHeader: false,
  // Не пишем аргументы server actions в dev-лог: среди них могут быть токены брокеров
  logging: { serverFunctions: false },
  serverExternalPackages: ["@node-rs/argon2", "pg-boss", "pino", "pg", "exceljs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

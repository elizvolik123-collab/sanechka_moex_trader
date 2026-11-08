"use client";

import "./globals.css";

/**
 * Ошибка в корневом макете (шапка не отрисовалась). Заменяет весь документ, поэтому
 * свои <html>/<body>; тема — по настройке системы.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <html lang="ru">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
        <title>Ошибка — MOEX Trader</title>
        <div className="grid max-w-md gap-4 text-center" role="alert">
          <h1 className="text-xl font-semibold">Сервис временно недоступен</h1>
          <p className="text-sm text-muted-foreground">Попробуйте обновить страницу через минуту.</p>
          {digest && <p className="text-xs text-muted-foreground">Код ошибки: {digest}</p>}
          <button
            type="button"
            onClick={retry}
            className="mx-auto cursor-pointer rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Повторить
          </button>
        </div>
      </body>
    </html>
  );
}

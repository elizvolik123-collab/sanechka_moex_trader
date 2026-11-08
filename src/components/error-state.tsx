"use client";

import Link from "next/link";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Экран ошибки сегмента. Сообщения серверных ошибок Next.js в продакшене не раскрывает —
 * показываем только код (digest), по которому ошибку можно найти в логах сервера.
 */
export function ErrorState({ error, retry, title = "Что-то пошло не так" }: { error: unknown; retry?: () => void; title?: string }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center" role="alert">
      <TriangleAlertIcon className="size-10 text-amber-500" />
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">
          Не удалось загрузить страницу. Попробуйте ещё раз — если ошибка повторяется, данные могут быть временно
          недоступны.
        </p>
        {digest && <p className="text-xs text-muted-foreground">Код ошибки: {digest}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {retry && (
          <Button onClick={retry}>
            <RotateCcwIcon /> Повторить
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  );
}

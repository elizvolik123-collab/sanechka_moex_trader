"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

/** Ошибка любой страницы приложения: шапка остаётся, страницу можно перезапросить. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorState error={error} retry={retry} />;
}

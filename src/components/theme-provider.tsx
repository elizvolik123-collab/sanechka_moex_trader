"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// Скрипт темы исполняется только из серверного HTML (до первой отрисовки). На клиенте тип text/plain,
// иначе React 19 в dev предупреждает о <script> внутри компонента; расхождение типа гасит suppressHydrationWarning.
const scriptProps = {
  type: typeof window === "undefined" ? "text/javascript" : "text/plain",
  suppressHydrationWarning: true,
} as const;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={scriptProps}
    >
      {children}
    </NextThemesProvider>
  );
}

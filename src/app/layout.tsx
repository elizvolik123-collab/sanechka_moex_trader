import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MOEX Trader", template: "%s — MOEX Trader" },
  description: "Дневник сделок, калькулятор риска и новости для трейдеров Московской биржи",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" suppressHydrationWarning className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          {/* Для клавиатуры и скринридеров: сразу к содержимому, минуя меню */}
          <a
            href="#content"
            className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
          >
            Перейти к содержимому
          </a>
          <SiteHeader />
          <main id="content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:py-8">
            {children}
          </main>
          <SiteFooter />
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}

import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { CandlestickChartIcon } from "lucide-react";
import { MainNav } from "@/components/main-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserMenu } from "@/components/user-menu";
import { logger } from "@/server/logger";
import { getCurrentUser } from "@/server/session";

export async function SiteHeader() {
  // Сбой чтения сессии (например, база недоступна) не должен ронять весь макет: шапка — как для гостя,
  // а ошибку покажет страница внутри макета (error.tsx) с навигацией и кнопкой «Повторить»
  const user = await getCurrentUser().catch((error: unknown) => {
    // Служебные исключения Next.js (динамический рендер, redirect) должны пройти дальше
    unstable_rethrow(error);
    logger.error({ err: error }, "Не удалось прочитать сессию для шапки");
    return null;
  });
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <CandlestickChartIcon className="size-5 text-primary" />
          <span>MOEX Trader</span>
        </Link>
        <MainNav className="hidden md:flex" />
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <UserMenu user={user ? { name: user.name, email: user.email } : null} />
        </div>
      </div>
      <MainNav className="mx-auto max-w-7xl border-t px-2 py-1 md:hidden" />
    </header>
  );
}

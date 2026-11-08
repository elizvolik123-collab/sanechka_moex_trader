"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalculatorIcon, NewspaperIcon, NotebookPenIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/journal", label: "Дневник", icon: NotebookPenIcon },
  { href: "/calculator", label: "Калькулятор", icon: CalculatorIcon },
  { href: "/news", label: "Новости", icon: NewspaperIcon },
  { href: "/account", label: "Личный кабинет", icon: UserRoundIcon },
] as const;

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Основные разделы" className={cn("no-scrollbar flex items-center gap-1 overflow-x-auto", className)}>
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardListIcon, LandmarkIcon, SlidersHorizontalIcon, UserRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/account", label: "Профиль", icon: UserRoundIcon },
  { href: "/account/brokers", label: "Брокерские счета", icon: LandmarkIcon },
  { href: "/account/plans", label: "Планы сделок", icon: ClipboardListIcon },
  { href: "/account/settings", label: "Настройки калькулятора", icon: SlidersHorizontalIcon },
] as const;

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Разделы кабинета" className="no-scrollbar flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === href
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

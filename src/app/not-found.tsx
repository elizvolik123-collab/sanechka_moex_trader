import type { Metadata } from "next";
import Link from "next/link";
import { CompassIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Страница не найдена" };

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <CompassIcon className="size-10 text-muted-foreground" />
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Страница не найдена</h1>
        <p className="text-sm text-muted-foreground">Возможно, ссылка устарела или в адресе опечатка.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/journal">Дневник</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/calculator">Калькулятор</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/news">Новости</Link>
        </Button>
      </div>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { CalculatorIcon, NewspaperIcon, NotebookPenIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/server/session";

const FEATURES = [
  {
    icon: NotebookPenIcon,
    title: "Дневник сделок",
    text: "Сделки подтягиваются из Т-Инвестиций по API или из отчёта брокера (CSV/XLSX). Статистика, кривая капитала, просадка, календарь результатов.",
    href: "/journal",
  },
  {
    icon: CalculatorIcon,
    title: "Калькулятор позиции",
    text: "Размер позиции по риску, стоп и тейк с округлением до шага цены — для акций, облигаций, фьючерсов и валюты Мосбиржи.",
    href: "/calculator",
  },
  {
    icon: NewspaperIcon,
    title: "Новости рынка",
    text: "Лента канала MarketTwits с поиском; тикеры в тексте открывают калькулятор по инструменту.",
    href: "/news",
  },
] as const;

/** Вошедших — сразу в дневник; гостям — краткое описание сервиса. */
export default async function HomePage() {
  if (await getCurrentUser()) redirect("/journal");

  return (
    <div className="grid gap-10 py-6 md:py-12">
      <section className="mx-auto grid max-w-2xl gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Дневник трейдера Московской биржи</h1>
        <p className="text-muted-foreground">
          Учёт сделок, риск-менеджмент и новости рынка в одном месте. Валюта — рубли, время — московское.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild size="lg">
            <Link href="/register">Создать аккаунт</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/calculator">Открыть калькулятор</Link>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-3" aria-label="Возможности">
        {FEATURES.map(({ icon: Icon, title, text, href }) => (
          <Link key={href} href={href} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader>
                <Icon className="size-6 text-primary" />
                <CardTitle className="mt-2">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{text}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}

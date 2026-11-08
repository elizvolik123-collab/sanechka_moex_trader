import { previewUser, visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import Link from "next/link";
import { CalculatorIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listTradePlans } from "@/server/services/trade-plans";
import { requireUser } from "@/server/session";
import { PlanCard } from "./plan-card";

export const metadata: Metadata = { title: "Планы сделок" };

export default async function PlansPage() {
  const user = visualPreview ? previewUser : await requireUser();
  const plans = visualPreview ? [] : await listTradePlans(user.id);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Планы сделок</h2>
        <Button asChild variant="outline" size="sm">
          <Link href="/calculator">
            <CalculatorIcon /> Новый расчёт
          </Link>
        </Button>
      </div>
      {plans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="text-sm text-muted-foreground">
            Планов пока нет. Рассчитайте позицию в калькуляторе и нажмите «Сохранить как план сделки».
          </CardContent>
        </Card>
      ) : (
        plans.map((p) => <PlanCard key={p.id} plan={p} />)
      )}
    </div>
  );
}

"use client";

import { useActionState, useEffect } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import type { CalculatorDefaults } from "@/server/services/user-settings";
import { saveSettingsAction, type ActionState } from "../actions";

const ru = (n: number) => String(n).replace(".", ",");

export function SettingsForm({ defaults }: { defaults: CalculatorDefaults }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettingsAction, {});

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
  }, [state]);

  const e = state.errors ?? {};
  const value = (key: keyof CalculatorDefaults) => state.values?.[key] ?? ru(defaults[key]);
  return (
    <form action={action} noValidate className="grid max-w-xl gap-4 sm:grid-cols-2">
      <FormField
        label="Размер счёта, ₽"
        name="depositRub"
        inputMode="decimal"
        defaultValue={value("depositRub")}
        error={e.depositRub}
      />
      <FormField
        label="Риск на сделку, %"
        name="riskPct"
        inputMode="decimal"
        defaultValue={value("riskPct")}
        error={e.riskPct}
        hint="Обычно 0,5–2%"
      />
      <FormField
        label="Соотношение прибыль/риск (R:R)"
        name="rewardRatio"
        inputMode="decimal"
        defaultValue={value("rewardRatio")}
        error={e.rewardRatio}
        hint="3 означает 1:3"
      />
      <FormField
        label="Комиссия брокера, % от оборота"
        name="commissionPct"
        inputMode="decimal"
        defaultValue={value("commissionPct")}
        error={e.commissionPct}
      />
      <Button type="submit" disabled={pending} className="justify-self-start sm:col-span-2">
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Сохранить
      </Button>
    </form>
  );
}

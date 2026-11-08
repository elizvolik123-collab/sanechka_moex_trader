"use client";

import { useActionState, useEffect, useRef } from "react";
import { ExternalLinkIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addConnectionAction, type ActionState } from "../actions";

export function AddConnectionForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addConnectionAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  const e = state.errors ?? {};
  return (
    <form ref={formRef} action={action} noValidate className="grid max-w-xl gap-4">
      {e.form && (
        <Alert variant="destructive">
          <AlertDescription>{e.form}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="broker">Брокер</Label>
        <Select name="broker" defaultValue="TINVEST">
          <SelectTrigger id="broker" aria-invalid={e.broker ? true : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TINVEST">Т-Инвестиции (T-Invest API)</SelectItem>
            <SelectItem value="FINAM" disabled>
              Финам Trade API — скоро
            </SelectItem>
            <SelectItem value="ALOR" disabled>
              Алор OpenAPI — скоро
            </SelectItem>
          </SelectContent>
        </Select>
        {e.broker && <p className="text-sm text-destructive">{e.broker}</p>}
      </div>
      <FormField
        label="Название"
        name="label"
        placeholder="Например, «Основной ИИС»"
        defaultValue={state.values?.label ?? ""}
        error={e.label}
        maxLength={60}
      />
      <FormField
        label="API-токен"
        name="token"
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder="t.xxxxxxxx"
        error={e.token}
        hint={
          <>
            Создайте токен с доступом <b>«Только для чтения»</b> в{" "}
            <a
              href="https://www.tbank.ru/invest/settings/api/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              настройках Т-Инвестиций <ExternalLinkIcon className="size-3" />
            </a>
          </>
        }
      />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-profit" />
        Сервис только читает счета и операции. После сохранения токен нельзя просмотреть — видны лишь последние 4
        символа.
      </p>
      <p className="text-xs text-muted-foreground">
        Брокера без открытого API можно добавить импортом отчёта (CSV/XLSX) во вкладке «Дневник».
      </p>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Подключить
      </Button>
    </form>
  );
}

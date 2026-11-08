"use client";

import { useState } from "react";
import { LoaderCircleIcon, MailCheckIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { forgotPasswordSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.requestPasswordReset({
      email: parsed.data.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPending(false);
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      return;
    }
    // Не раскрываем, существует ли аккаунт: ответ одинаковый для любого email
    setSent(true);
  }

  if (sent) {
    return (
      <Alert>
        <MailCheckIcon className="text-profit" />
        <AlertTitle>Проверьте почту</AlertTitle>
        <AlertDescription>
          Если аккаунт с таким email существует, мы отправили на него ссылку для смены пароля. Ссылка действует 1 час.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}
      <FormField label="Email" name="email" type="email" autoComplete="email" error={errors.email} autoFocus />
      <Button type="submit" disabled={pending}>
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Отправить ссылку
      </Button>
    </form>
  );
}

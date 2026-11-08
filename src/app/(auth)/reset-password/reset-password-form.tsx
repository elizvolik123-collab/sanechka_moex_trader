"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { resetPasswordSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = resetPasswordSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: parsed.data.password, token });
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      setPending(false);
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}
      <FormField
        label="Новый пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        error={errors.password}
        hint="Не короче 8 символов"
        autoFocus
      />
      <FormField
        label="Повторите пароль"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={errors.confirm}
      />
      <Button type="submit" disabled={pending}>
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Сохранить пароль
      </Button>
    </form>
  );
}

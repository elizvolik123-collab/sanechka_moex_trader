"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { signUpSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";

export function RegisterForm() {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { name, email, password } = parsed.data;
    const { error } = await authClient.signUp.email({ name, email, password });
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      setPending(false);
      return;
    }
    router.push("/account/brokers");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}
      <FormField label="Имя" name="name" autoComplete="name" error={errors.name} autoFocus />
      <FormField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
      <FormField
        label="Пароль"
        name="password"
        type="password"
        autoComplete="new-password"
        error={errors.password}
        hint="Не короче 8 символов"
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
        Создать аккаунт
      </Button>
    </form>
  );
}

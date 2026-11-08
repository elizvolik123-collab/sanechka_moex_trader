"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CircleCheckIcon, LoaderCircleIcon } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { signInSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";

export function LoginForm({ next, passwordReset }: { next: string; passwordReset: boolean }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = signInSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.signIn.email(parsed.data);
    if (error) {
      setErrors({ form: authErrorMessage(error) });
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {passwordReset && (
        <Alert>
          <CircleCheckIcon className="text-profit" />
          <AlertDescription>Пароль изменён. Войдите с новым паролем.</AlertDescription>
        </Alert>
      )}
      {errors.form && (
        <Alert variant="destructive">
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}
      <FormField label="Email" name="email" type="email" autoComplete="email" error={errors.email} autoFocus />
      <div className="grid gap-2">
        <FormField
          label="Пароль"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Link href="/forgot-password" className="justify-self-end text-sm text-primary hover:underline">
          Забыли пароль?
        </Link>
      </div>
      <Button type="submit" disabled={pending}>
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Войти
      </Button>
    </form>
  );
}

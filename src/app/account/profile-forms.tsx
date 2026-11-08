"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { authErrorMessage } from "@/lib/auth-errors";
import { authClient } from "@/lib/auth-client";
import { profileSchema } from "@/lib/validation/account";
import { passwordSchema, toFieldErrors, type FieldErrors } from "@/lib/validation/auth";

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = profileSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.updateUser({ name: parsed.data.name });
    setPending(false);
    if (error) {
      toast.error(authErrorMessage(error));
      return;
    }
    toast.success("Профиль сохранён");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormField label="Имя" name="name" defaultValue={name} autoComplete="name" error={errors.name} />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Сохранить
      </Button>
    </form>
  );
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ["confirm"], message: "Пароли не совпадают" });

export function ChangePasswordForm() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = changePasswordSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setErrors({ currentPassword: authErrorMessage(error) });
      return;
    }
    form.reset();
    toast.success("Пароль изменён");
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormField
        label="Текущий пароль"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword}
      />
      <FormField
        label="Новый пароль"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        error={errors.newPassword}
        hint="Не короче 8 символов"
      />
      <FormField
        label="Повторите новый пароль"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={errors.confirm}
      />
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending && <LoaderCircleIcon className="animate-spin" />}
        Сменить пароль
      </Button>
    </form>
  );
}

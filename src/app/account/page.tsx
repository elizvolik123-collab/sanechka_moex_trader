import { previewUser, visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateMsk } from "@/lib/format";
import { db } from "@/server/db";
import { requireUser } from "@/server/session";
import { ChangePasswordForm, ProfileForm } from "./profile-forms";

export const metadata: Metadata = { title: "Профиль" };

export default async function ProfilePage() {
  const user = visualPreview ? previewUser : await requireUser();
  const { createdAt } = visualPreview ? { createdAt: new Date("2026-01-01") } : await db().user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true } });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
          <CardDescription>
            {user.email} · с нами с {formatDateMsk(createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm name={user.name} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Смена пароля</CardTitle>
          <CardDescription>После смены пароля остальные сеансы будут завершены</CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

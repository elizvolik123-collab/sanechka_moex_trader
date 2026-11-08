import { previewDefaults, previewUser, visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCalculatorDefaults } from "@/server/services/user-settings";
import { requireUser } from "@/server/session";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Настройки калькулятора" };

export default async function SettingsPage() {
  const user = visualPreview ? previewUser : await requireUser();
  const defaults = visualPreview ? previewDefaults : await getCalculatorDefaults(user.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройки калькулятора</CardTitle>
        <CardDescription>Эти значения подставляются в калькулятор позиции при открытии</CardDescription>
      </CardHeader>
      <CardContent>
        <SettingsForm defaults={defaults} />
      </CardContent>
    </Card>
  );
}

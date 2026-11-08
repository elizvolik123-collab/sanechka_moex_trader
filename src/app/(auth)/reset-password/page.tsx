import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Новый пароль" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token, error } = await searchParams;
  const validToken = typeof token === "string" && token.length > 0 && !error;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Новый пароль</CardTitle>
        <CardDescription>Придумайте новый пароль для входа</CardDescription>
      </CardHeader>
      <CardContent>
        {validToken ? (
          <ResetPasswordForm token={token} />
        ) : (
          <Alert variant="destructive">
            <AlertDescription>Ссылка недействительна или устарела. Запросите восстановление ещё раз.</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Link href={validToken ? "/login" : "/forgot-password"} className="font-medium text-primary hover:underline">
          {validToken ? "Вернуться ко входу" : "Запросить новую ссылку"}
        </Link>
      </CardFooter>
    </Card>
  );
}

import { visualPreview } from "@/lib/visual-preview";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";

/**
 * Data Access Layer: единственная точка чтения сессии.
 * Любая серверная функция с пользовательскими данными начинается с requireUser().
 */
export const getSession = cache(async () => {
  // Сначала ждём запрос, чтобы статическая сборка не читала настройки авторизации.
  if (visualPreview) return null;
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
});

export type CurrentUser = { id: string; email: string; name: string };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name };
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

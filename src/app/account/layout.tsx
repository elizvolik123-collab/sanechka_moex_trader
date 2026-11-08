import { visualPreview } from "@/lib/visual-preview";
import { AccountNav } from "./account-nav";
import { requireUser } from "@/server/session";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  if (!visualPreview) await requireUser();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Личный кабинет</h1>
        <p className="text-sm text-muted-foreground">Профиль, брокерские счета и настройки по умолчанию</p>
      </div>
      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <AccountNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

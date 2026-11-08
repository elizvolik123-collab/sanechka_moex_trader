import { previewUser, visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { listFileAccounts } from "@/server/services/file-accounts";
import { requireUser } from "@/server/session";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Импорт сделок" };

export default async function ImportPage() {
  const user = visualPreview ? previewUser : await requireUser();
  const accounts = visualPreview ? [] : await listFileAccounts(user.id);

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <Link href="/journal" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> Дневник
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Импорт брокерского отчёта</h1>
        <p className="text-sm text-muted-foreground">
          CSV или XLSX со списком сделок. Повторная загрузка того же файла не создаёт дублей.
        </p>
      </div>
      <ImportWizard accounts={accounts} />
    </div>
  );
}

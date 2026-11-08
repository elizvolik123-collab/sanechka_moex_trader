import { previewUser, visualPreview } from "@/lib/visual-preview";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listConnections } from "@/server/services/broker-connections";
import { requireUser } from "@/server/session";
import { AddConnectionForm } from "./add-connection-form";
import { ConnectionCard } from "./connection-card";

export const metadata: Metadata = { title: "Брокерские счета" };

export default async function BrokersPage() {
  const user = visualPreview ? previewUser : await requireUser();
  const connections = visualPreview ? [] : await listConnections(user.id);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4" aria-labelledby="connections-title">
        <h2 id="connections-title" className="text-lg font-semibold">
          Подключённые счета
        </h2>
        {connections.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="text-sm text-muted-foreground">
              Пока нет подключений. Добавьте токен брокера ниже — сделки загрузятся в дневник автоматически.
            </CardContent>
          </Card>
        ) : (
          connections.map((c) => <ConnectionCard key={c.id} connection={c} />)
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Подключить брокера</CardTitle>
          <CardDescription>
            Токен хранится в зашифрованном виде (AES-256-GCM) и используется только на сервере для чтения операций
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddConnectionForm />
        </CardContent>
      </Card>
    </div>
  );
}

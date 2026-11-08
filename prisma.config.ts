import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Генерация клиента при установке не подключается к базе. URL нужен для миграций.
  datasource: { url: process.env.DATABASE_URL },
});

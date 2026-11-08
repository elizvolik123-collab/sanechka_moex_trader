import { NextResponse } from "next/server";
import { guessMapping } from "@/core/import/mapping";
import { logger } from "@/server/logger";
import { rateLimit } from "@/server/rate-limit";
import { ImportFileError, readImportFile } from "@/server/import/read-file";
import { listImportPresets } from "@/server/services/journal-import";
import { getCurrentUser } from "@/server/session";

/** Шаг 1 импорта: читает файл и возвращает таблицу, угаданное сопоставление колонок и шаблоны пользователя. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const limited = rateLimit(request, `import-preview:${user.id}`, 20);
  if (limited) return limited;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });

  try {
    const table = await readImportFile(file);
    const presets = await listImportPresets(user.id);
    return NextResponse.json({
      fileName: file.name,
      table,
      guessed: guessMapping(table.headers),
      presets,
    });
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ error: error.message }, { status: 422 });
    logger.error({ err: error, userId: user.id }, "Ошибка чтения файла импорта");
    return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 500 });
  }
}

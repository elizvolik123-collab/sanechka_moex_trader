import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { IMPORT_FIELDS, mappingErrors, normalizeRows, type ColumnMapping } from "@/core/import/mapping";
import { logger } from "@/server/logger";
import { rateLimit } from "@/server/rate-limit";
import { ImportFileError, readImportFile } from "@/server/import/read-file";
import { createFileAccount, findOwnFileAccount } from "@/server/services/file-accounts";
import { importExecutions, saveImportPreset } from "@/server/services/journal-import";
import { getCurrentUser } from "@/server/session";

const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [string, ...string[]];

const paramsSchema = z
  .object({
    mapping: z.string().transform((s, ctx) => {
      try {
        // partialRecord: в zod 4 обычный record с enum-ключами требует все ключи
        return z.partialRecord(z.enum(fieldKeys), z.number().int().min(0)).parse(JSON.parse(s)) as ColumnMapping;
      } catch {
        ctx.addIssue({ code: "custom", message: "Некорректное сопоставление колонок" });
        return z.NEVER;
      }
    }),
    quantityUnit: z.enum(["pieces", "lots"]),
    accountId: z.string().optional(),
    newAccountName: z.string().trim().max(60, "Название счёта слишком длинное").optional(),
    startingCapital: z.coerce.number().positive("Начальный капитал должен быть больше нуля").max(1e12).optional(),
    presetName: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.accountId || (v.newAccountName && v.startingCapital), {
    message: "Выберите счёт или укажите название и начальный капитал нового счёта",
  });

/** Шаг 2 импорта: нормализует строки по сопоставлению, сохраняет исполнения и собирает сделки. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const limited = rateLimit(request, `import-commit:${user.id}`, 10);
  if (limited) return limited;

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не передан" }, { status: 400 });

  const parsed = paramsSchema.safeParse({
    mapping: form.get("mapping"),
    quantityUnit: form.get("quantityUnit"),
    accountId: form.get("accountId") || undefined,
    newAccountName: form.get("newAccountName") || undefined,
    startingCapital: form.get("startingCapital") || undefined,
    presetName: form.get("presetName") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const params = parsed.data;

  const problems = mappingErrors(params.mapping);
  if (problems.length) return NextResponse.json({ error: problems.join("; ") }, { status: 400 });

  try {
    const table = await readImportFile(file);
    const { rows, errors } = normalizeRows(table, params.mapping);
    if (rows.length === 0) {
      return NextResponse.json({ error: "В файле нет ни одной распознанной сделки", errors: errors.slice(0, 100) }, { status: 422 });
    }

    let accountId = params.accountId;
    if (accountId) {
      if (!(await findOwnFileAccount(user.id, accountId))) {
        return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
      }
    } else {
      accountId = (await createFileAccount(user.id, params.newAccountName!, params.startingCapital!)).id;
    }

    const summary = await importExecutions({ accountId, rows, quantityUnit: params.quantityUnit, parseErrors: errors });

    if (params.presetName) {
      const byHeader = Object.fromEntries(
        Object.entries(params.mapping).map(([field, idx]) => [field, table.headers[idx as number] ?? ""]),
      );
      await saveImportPreset(user.id, params.presetName, byHeader, params.quantityUnit);
    }

    revalidatePath("/journal");
    revalidatePath("/account/brokers");
    return NextResponse.json({ accountId, ...summary, errors: summary.errors.slice(0, 200) });
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ error: error.message }, { status: 422 });
    logger.error({ err: error, userId: user.id }, "Ошибка импорта сделок");
    return NextResponse.json({ error: "Не удалось импортировать файл" }, { status: 500 });
  }
}

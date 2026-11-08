import ExcelJS from "exceljs";
import { decodeText, parseCsv } from "@/core/import/csv";
import { detectTable, guessMapping, type RawTable } from "@/core/import/mapping";

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

export class ImportFileError extends Error {}

const pad = (n: number) => String(n).padStart(2, "0");

/** Значение ячейки Excel → строка. Даты Excel хранит «как на экране»: берём UTC-компоненты как московское время. */
function cellToString(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("result" in value) return cellToString((value.result ?? null) as ExcelJS.CellValue);
  if ("text" in value) return String(value.text);
  return "";
}

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new ImportFileError("Не удалось прочитать XLSX-файл. Проверьте, что это файл Excel 2007+ (.xlsx)");
  }
  // В отчёте может быть несколько листов — берём тот, где лучше всего узнаются колонки сделок
  let best: { rows: string[][]; score: number } = { rows: [], score: -1 };
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    const cols = ws.columnCount;
    ws.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= cols; c++) cells.push(cellToString(row.getCell(c).value).trim());
      rows.push(cells);
    });
    const table = detectTable(rows);
    const score = Object.keys(guessMapping(table.headers)).length;
    if (score > best.score) best = { rows, score };
  });
  return best.rows;
}

/** Файл отчёта (CSV/TXT/XLSX) → таблица с найденной строкой заголовков. */
export async function readImportFile(file: File): Promise<RawTable> {
  if (file.size === 0) throw new ImportFileError("Файл пустой");
  if (file.size > MAX_IMPORT_BYTES) throw new ImportFileError("Файл больше 10 МБ");
  const name = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());

  let rows: string[][];
  if (name.endsWith(".xlsx")) rows = await readXlsx(bytes);
  else if (name.endsWith(".csv") || name.endsWith(".txt")) rows = parseCsv(decodeText(bytes));
  else if (name.endsWith(".xls")) throw new ImportFileError("Старый формат .xls не поддерживается — пересохраните файл как .xlsx или .csv");
  else throw new ImportFileError("Поддерживаются файлы .csv, .txt и .xlsx");

  const table = detectTable(rows);
  if (table.headers.length === 0) throw new ImportFileError("В файле не найдено данных");
  if (table.rows.length > MAX_IMPORT_ROWS) throw new ImportFileError(`Слишком много строк (больше ${MAX_IMPORT_ROWS})`);
  return table;
}

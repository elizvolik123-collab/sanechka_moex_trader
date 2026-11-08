import Papa from "papaparse";

/**
 * CSV → массив строк. Разделитель (; , табуляция |) определяется автоматически.
 * Пустые строки сохраняются, чтобы номера строк в ошибках совпадали с файлом.
 */
export function parseCsv(text: string): string[][] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, "").replace(/(\r?\n)+$/, ""), {
    skipEmptyLines: false,
    delimitersToGuess: [";", ",", "\t", "|"],
  });
  return result.data.map((row) => row.map((c) => (c ?? "").toString()));
}

/**
 * Декодирует байты файла: UTF-8, а если файл не является корректным UTF-8 — Windows-1251
 * (так выгружают отчёты многие российские брокеры).
 */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

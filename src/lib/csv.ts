/**
 * CSV для Excel в русской локали: разделитель «;», десятичная запятая, UTF-8 с BOM
 * (без BOM Excel откроет кириллицу как кракозябры), переводы строк CRLF.
 */

export type CsvCell = string | number | null | undefined;

function escapeCell(value: CsvCell, sep: string): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? csvNumber(value) : value;
  return /["\r\n]/.test(s) || s.includes(sep) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Число без разделителей разрядов, с десятичной запятой. */
export function csvNumber(value: number, maxDecimals = 9): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(maxDecimals))).replace(".", ",");
}

export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[], sep = ";"): string {
  const lines = [headers, ...rows].map((row) => row.map((c) => escapeCell(c, sep)).join(sep));
  return `﻿${lines.join("\r\n")}\r\n`;
}

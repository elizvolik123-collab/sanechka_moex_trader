/** Ввод и вывод чисел в русской локали: пробелы-разделители разрядов, запятая как десятичный разделитель. */

/** "1 234,5" → 1234.5; пустая или некорректная строка → NaN. */
export function parseNumber(value: string): number {
  const s = value.replace(/[\s  ]/g, "").replace(",", ".");
  if (s === "" || s === "-" || s === ".") return Number.NaN;
  return /^-?\d*\.?\d*$/.test(s) ? Number(s) : Number.NaN;
}

/** Число → строка для поля ввода (без разделителей разрядов). */
export function toInputString(value: number, maxDecimals = 10): string {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toFixed(maxDecimals))).replace(".", ",");
}

const cache = new Map<string, Intl.NumberFormat>();

function formatter(min: number, max: number) {
  const key = `${min}:${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, f);
  }
  return f;
}

/** Цена с точностью инструмента: 301,25 / 95 000 / 58,912. */
export function formatPrice(value: number, decimals: number): string {
  return formatter(decimals, decimals).format(value);
}

/** Деньги в рублях: 12 345,67 ₽ */
export function formatMoney(value: number, decimals = 2): string {
  return `${formatter(0, decimals).format(value)} ₽`;
}

export function formatNumber(value: number, maxDecimals = 2): string {
  return formatter(0, maxDecimals).format(value);
}

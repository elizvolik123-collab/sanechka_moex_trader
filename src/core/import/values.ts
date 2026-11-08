/** Разбор значений ячеек брокерских отчётов: числа, направление сделки, дата и время. */

/** "1 234,56" / "1234.56" / "1,234.56" / "-12,5 ₽" → число; пусто или мусор → null. */
export function parseDecimalCell(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s  ']/g, "").replace(/(руб\.?|rub|₽|rur|sur)$/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    // Десятичный разделитель — последний из двух, второй — разделитель разрядов
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = s.replace(",", ".");
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Покупка / продажа в разных написаниях брокеров. */
export function parseSide(raw: string | null | undefined): "BUY" | "SELL" | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/ё/g, "е");
  if (!s) return null;
  if (/^(b|buy|bought|long|к|куп|покупка)$/.test(s) || /покуп|купля|buy/.test(s)) return "BUY";
  if (/^(s|sell|sold|short|п|прод|продажа)$/.test(s) || /прод|sell/.test(s)) return "SELL";
  return null;
}

const pad = (n: string | undefined, len = 2) => (n ?? "0").padStart(len, "0");

/**
 * Дата и время сделки. Без явного часового пояса время считается московским (UTC+3, без перехода на летнее время).
 * Поддерживаются: ДД.ММ.ГГГГ[ ЧЧ:ММ[:СС]], ГГГГ-ММ-ДД[ ЧЧ:ММ[:СС[.мс]]][Z|±ЧЧ:ММ], ДД/ММ/ГГГГ, время отдельной колонкой.
 */
export function parseDateTime(dateRaw: string | null | undefined, timeRaw?: string | null): Date | null {
  const d = String(dateRaw ?? "").trim();
  if (!d) return null;
  let y: string, mo: string, day: string;
  let h: string | undefined, mi: string | undefined, sec: string | undefined;
  let offset: string | undefined;

  let m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(d);
  if (m) {
    [, day, mo, y, h, mi, sec] = m;
  } else {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(d);
    if (!m) return null;
    [, y, mo, day, h, mi, sec, offset] = m;
  }

  if (h === undefined && timeRaw) {
    const t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(timeRaw).trim());
    if (t) [, h, mi, sec] = t;
  }

  const month = Number(mo);
  const date = Number(day);
  if (month < 1 || month > 12 || date < 1 || date > 31) return null;
  if (h !== undefined && (Number(h) > 23 || Number(mi) > 59 || Number(sec ?? 0) > 59)) return null;

  const tz = !offset ? "+03:00" : offset === "Z" ? "Z" : offset.includes(":") ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const iso = `${y}-${pad(mo)}-${pad(day)}T${pad(h)}:${pad(mi)}:${pad(sec)}${tz}`;
  const result = new Date(iso);
  // Отсекаем несуществующие даты вроде 31.02 (Date «переносит» их на март)
  if (Number.isNaN(result.getTime())) return null;
  const check = new Date(result.getTime() + (tz === "Z" ? 0 : 3 * 3600_000));
  if (tz !== "Z" && !offset && check.getUTCDate() !== date) return null;
  return result;
}

/** Быстрый некриптографический хэш строки (cyrb53) — для стабильных id строк без номера сделки. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

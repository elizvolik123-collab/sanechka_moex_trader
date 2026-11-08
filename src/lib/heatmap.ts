/** Календарь-тепловая карта P&L: раскладка по неделям и уровни расходящейся шкалы. Чистые функции. */

/** Ключ дня "YYYY-MM-DD" ↔ дата (UTC-полночь — только для арифметики дней, без часовых поясов). */
const toDate = (key: string) => new Date(`${key}T00:00:00Z`);
const toKey = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export type CalendarLayout = {
  /** Колонки-недели (понедельник → воскресенье); null — день вне диапазона */
  weeks: (string | null)[][];
  /** Подписи месяцев над первой неделей месяца */
  months: { week: number; label: string }[];
};

const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** Недели от дня from до дня to включительно (не больше maxWeeks последних). */
export function calendarLayout(fromKey: string, toKeyIncl: string, maxWeeks = 53): CalendarLayout {
  let from = toDate(fromKey);
  const to = toDate(toKeyIncl);
  const earliest = addDays(to, -(maxWeeks * 7 - 1));
  if (from < earliest) from = earliest;

  // Начало — понедельник недели первого дня
  const shift = (from.getUTCDay() + 6) % 7;
  let cursor = addDays(from, -shift);
  const weeks: (string | null)[][] = [];
  const months: { week: number; label: string }[] = [];
  let lastMonth = -1;

  while (cursor <= to) {
    const week: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i);
      const inRange = day >= from && day <= to;
      week.push(inRange ? toKey(day) : null);
      if (inRange && day.getUTCDate() <= 7 && day.getUTCMonth() !== lastMonth && i === 0) {
        lastMonth = day.getUTCMonth();
        months.push({ week: weeks.length, label: MONTHS[lastMonth] });
      }
    }
    if (months.length === 0 && week.some(Boolean)) {
      const first = toDate(week.find(Boolean)!);
      lastMonth = first.getUTCMonth();
      months.push({ week: 0, label: MONTHS[lastMonth] });
    }
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return { weeks, months };
}

/** Пороги для 3 ступеней на каждое плечо шкалы — терцили модулей ненулевых значений. */
export function magnitudeThresholds(values: readonly number[]): [number, number] {
  const abs = values.filter((v) => v !== 0).map(Math.abs).sort((a, b) => a - b);
  if (abs.length === 0) return [0, 0];
  const q = (p: number) => abs[Math.min(abs.length - 1, Math.floor(p * abs.length))];
  return [q(1 / 3), q(2 / 3)];
}

/** Уровень −3…3: знак — прибыль/убыток, модуль — сила; 0 — ровно ноль. */
export function divergingLevel(value: number, [t1, t2]: readonly [number, number]): number {
  if (value === 0) return 0;
  const a = Math.abs(value);
  const step = a <= t1 ? 1 : a <= t2 ? 2 : 3;
  return value > 0 ? step : -step;
}

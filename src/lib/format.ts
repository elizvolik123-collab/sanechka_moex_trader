/** Форматирование для интерфейса: русская локаль, рубли, московское время. */

export const MOSCOW_TZ = "Europe/Moscow";

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: MOSCOW_TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const rubFmt = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 2,
});

export function formatDateTimeMsk(value: Date | string | number): string {
  return `${dateTimeFmt.format(new Date(value))} МСК`;
}

export function formatDateMsk(value: Date | string | number): string {
  return dateFmt.format(new Date(value));
}

export function formatRub(value: number | string): string {
  return rubFmt.format(Number(value));
}

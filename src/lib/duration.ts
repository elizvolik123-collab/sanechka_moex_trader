/** Длительность удержания: «45 мин», «3 ч 20 мин», «2 дн 4 ч». */
export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const days = Math.floor(sec / 86_400);
  const hours = Math.floor((sec % 86_400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  if (days > 0) return hours ? `${days} дн ${hours} ч` : `${days} дн`;
  if (hours > 0) return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  if (minutes > 0) return `${minutes} мин`;
  return `${sec} с`;
}

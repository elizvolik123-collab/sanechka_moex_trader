/**
 * Поиск и подсветка тикеров в тексте новостей.
 * Распознаются: кэштеги $SBER и хэштеги #SBER, тикеры заглавными отдельным словом (SBER, MOEX)
 * и названия компаний по-русски («Сбер», «Газпрома»). Ссылкой становится только тикер,
 * который есть в справочнике инструментов — иначе калькулятору нечего открыть.
 */

/** Название (основа слова) → тикер. Многословные названия идут первыми, чтобы «Газпром нефть» не стал «Газпромом». */
export const COMPANY_ALIASES: readonly (readonly [string, string])[] = [
  ["Газпром нефть", "SIBN"],
  ["Норильский никель", "GMKN"],
  ["Интер РАО", "IRAO"],
  ["АФК Система", "AFKS"],
  ["Сбербанк", "SBER"],
  ["Сбер", "SBER"],
  ["Газпром", "GAZP"],
  ["Лукойл", "LKOH"],
  ["Роснефть", "ROSN"],
  ["Новатэк", "NVTK"],
  ["Татнефть", "TATN"],
  ["Сургутнефтегаз", "SNGS"],
  ["Норникель", "GMKN"],
  ["Яндекс", "YDEX"],
  ["ВТБ", "VTBR"],
  ["Магнит", "MGNT"],
  ["Полюс", "PLZL"],
  ["Аэрофлот", "AFLT"],
  ["Мосбиржа", "MOEX"],
  ["Московская биржа", "MOEX"],
  ["МТС", "MTSS"],
  ["Северсталь", "CHMF"],
  ["НЛМК", "NLMK"],
  ["ММК", "MAGN"],
  ["Алроса", "ALRS"],
  ["Русал", "RUAL"],
  ["ФосАгро", "PHOR"],
  ["Совкомфлот", "FLOT"],
  ["Самолет", "SMLT"],
  ["Самолёт", "SMLT"],
  ["Мечел", "MTLR"],
  ["РусГидро", "HYDR"],
  ["Ростелеком", "RTKM"],
  ["Озон", "OZON"],
  ["Ozon", "OZON"],
];

export type TickerMatch = { start: number; end: number; ticker: string };

const CASHTAG = /[$#]([A-Za-z][A-Za-z0-9]{0,11})\b/g;
const UPPER_WORD = /(?<![\p{L}\p{N}$#])([A-Z][A-Z0-9]{2,6})(?![\p{L}\p{N}])/gu;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Регулярки названий: основа + до 3 букв окончания («Сбера», «Газпрому»), не внутри другого слова. */
const aliasPatterns = COMPANY_ALIASES.map(([name, ticker]) => ({
  ticker,
  re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name).replace(/ /g, "\\s+")}\\p{L}{0,3}(?![\\p{L}\\p{N}])`, "giu"),
}));

/** Все упоминания тикеров в тексте (без пересечений, по порядку). */
export function findTickerMatches(text: string, known: ReadonlySet<string>): TickerMatch[] {
  const matches: TickerMatch[] = [];
  const taken = (start: number, end: number) => matches.some((m) => start < m.end && end > m.start);
  const add = (start: number, end: number, raw: string) => {
    const ticker = known.has(raw) ? raw : known.has(raw.toUpperCase()) ? raw.toUpperCase() : null;
    if (ticker && !taken(start, end)) matches.push({ start, end, ticker });
  };

  for (const m of text.matchAll(CASHTAG)) add(m.index, m.index + m[0].length, m[1]);
  for (const m of text.matchAll(UPPER_WORD)) add(m.index, m.index + m[0].length, m[1]);
  for (const { ticker, re } of aliasPatterns) {
    for (const m of text.matchAll(re)) add(m.index, m.index + m[0].length, ticker);
  }
  return matches.sort((a, b) => a.start - b.start);
}

/** Уникальные тикеры поста — сохраняются в БД для фильтров. */
export function findTickers(text: string, known: ReadonlySet<string>): string[] {
  return [...new Set(findTickerMatches(text, known).map((m) => m.ticker))];
}

/**
 * Оборачивает упоминания тикеров в очищенном HTML в ссылки на калькулятор.
 * Работает только с текстом между тегами и не трогает содержимое существующих ссылок.
 */
export function highlightTickers(html: string, known: ReadonlySet<string>): string {
  if (known.size === 0) return html;
  let insideLink = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        // Хэштег-ссылка Telegram (#SBER → поиск по каналу) для известного тикера ведёт в калькулятор
        const tag = /^<a\s[^>]*href="https:\/\/t\.me\/s\/[^"?]+\?q=%23([A-Za-z0-9]{1,12})"/i.exec(part)?.[1]?.toUpperCase();
        if (tag && known.has(tag)) {
          insideLink += 1;
          return `<a href="/calculator?ticker=${encodeURIComponent(tag)}" class="ticker-link" data-ticker="${tag}" title="Открыть ${tag} в калькуляторе">`;
        }
        if (/^<a[\s>]/i.test(part)) insideLink += 1;
        else if (/^<\/a>/i.test(part)) insideLink = Math.max(0, insideLink - 1);
        return part;
      }
      if (insideLink > 0 || !part) return part;
      const matches = findTickerMatches(part, known);
      if (matches.length === 0) return part;
      let out = "";
      let pos = 0;
      for (const m of matches) {
        out += part.slice(pos, m.start);
        out += `<a href="/calculator?ticker=${encodeURIComponent(m.ticker)}" class="ticker-link" data-ticker="${m.ticker}" title="Открыть ${m.ticker} в калькуляторе">${part.slice(m.start, m.end)}</a>`;
        pos = m.end;
      }
      return out + part.slice(pos);
    })
    .join("");
}

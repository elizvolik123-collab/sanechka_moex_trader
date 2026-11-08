import { describe, expect, it } from "vitest";
import { findTickers, highlightTickers } from "./tickers";

const KNOWN = new Set(["SBER", "GAZP", "SIBN", "LKOH", "MOEX", "VTBR", "YDEX"]);

describe("findTickers", () => {
  it("кэштеги и хэштеги", () => {
    expect(findTickers("Покупаю $SBER и #gazp", KNOWN)).toEqual(["SBER", "GAZP"]);
  });

  it("тикер заглавными отдельным словом", () => {
    expect(findTickers("LKOH растёт, а MOEX падает", KNOWN)).toEqual(["LKOH", "MOEX"]);
  });

  it("не путает тикер с частью слова или неизвестным сокращением", () => {
    expect(findTickers("SBERBANK и USD/RUB, ЦБ, CEO", KNOWN)).toEqual([]);
  });

  it("русские названия с окончаниями", () => {
    expect(findTickers("Дивиденды Сбера и отчёт Газпрома, акции ВТБ", KNOWN)).toEqual(["SBER", "GAZP", "VTBR"]);
  });

  it("многословное название важнее короткого: «Газпром нефть» — это SIBN", () => {
    expect(findTickers("Газпром нефть увеличила добычу", KNOWN)).toEqual(["SIBN"]);
  });

  it("неизвестный справочнику тикер не считается", () => {
    expect(findTickers("$AAPL и $SBER", KNOWN)).toEqual(["SBER"]);
  });
});

describe("highlightTickers", () => {
  it("оборачивает упоминания в ссылки на калькулятор", () => {
    const html = highlightTickers("<b>Сбер</b> отчитался: $SBER +2%", KNOWN);
    expect(html).toBe(
      '<b><a href="/calculator?ticker=SBER" class="ticker-link" data-ticker="SBER" title="Открыть SBER в калькуляторе">Сбер</a></b> отчитался: ' +
        '<a href="/calculator?ticker=SBER" class="ticker-link" data-ticker="SBER" title="Открыть SBER в калькуляторе">$SBER</a> +2%',
    );
  });

  it("не трогает текст внутри существующих ссылок и атрибуты тегов", () => {
    const html = '<a href="https://example.com/SBER">новость про SBER</a> и GAZP';
    const out = highlightTickers(html, KNOWN);
    expect(out.startsWith('<a href="https://example.com/SBER">новость про SBER</a>')).toBe(true);
    expect(out).toContain('data-ticker="GAZP"');
  });

  it("хэштег Telegram с известным тикером ведёт в калькулятор, остальные хэштеги не трогает", () => {
    const html =
      '<a href="https://t.me/s/chan?q=%23SBER" target="_blank" rel="noopener noreferrer nofollow">#SBER</a> ' +
      '<a href="https://t.me/s/chan?q=%23%D0%B8%D0%B8" target="_blank" rel="noopener noreferrer nofollow">#ии</a>';
    const out = highlightTickers(html, KNOWN);
    expect(out).toContain('<a href="/calculator?ticker=SBER" class="ticker-link" data-ticker="SBER" title="Открыть SBER в калькуляторе">#SBER</a>');
    expect(out).toContain('href="https://t.me/s/chan?q=%23%D0%B8%D0%B8"');
  });

  it("без справочника HTML не меняется", () => {
    expect(highlightTickers("$SBER", new Set())).toBe("$SBER");
  });
});

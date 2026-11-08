import { describe, expect, it } from "vitest";
import { htmlToText, parseChannelPage, parseViews, sanitizePostHtml } from "./telegram";

// Синтетическая разметка в формате t.me/s/<канал> (структура классов как у настоящего превью)
const message = (id: number, inner: string, extra = "") => `
<div class="tgme_widget_message_wrap js-widget_message_wrap">
  <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="testchan/${id}">
    <div class="tgme_widget_message_bubble">
      ${inner}
      <div class="tgme_widget_message_footer compact js-message_footer">
        <div class="tgme_widget_message_info short js-message_info">
          <span class="tgme_widget_message_views">16.9K</span>
          <span class="tgme_widget_message_meta">${extra}<a class="tgme_widget_message_date" href="https://t.me/testchan/${id}"><time datetime="2026-11-06T04:02:49+00:00" class="time">07:02</time></a></span>
        </div>
      </div>
    </div>
  </div>
</div>`;

const PAGE = `<!DOCTYPE html><html><head><link rel="prev" href="/s/testchan?before=100"></head><body>
${message(100, `<a class="tgme_widget_message_photo_wrap 1 2" href="https://t.me/testchan/100" style="width:339px;background-image:url('https://cdn.example/photo1.jpg')"></a>
  <div class="tgme_widget_message_text js-message_text" dir="auto"><i class="emoji" style="background-image:url('//telegram.org/img/emoji/40/F09F8C8E.png')"><b>🌎</b></i><a href="?q=%23markets">#markets</a> <b>Сбер</b> отчитался: $SBER +2%<br/>Подробнее: <a href="https://example.com/news" onclick="alert(1)">ссылка</a><script>alert(1)</script></div>`)}
${message(101, `<div class="tgme_widget_message_text js-message_text" dir="auto">Ставка ЦБ &amp; рынок &lt;без изменений&gt;</div>`, "edited &nbsp;")}
${message(102, ``)}
<div class="tgme_widget_message js-widget_message" data-post="otherchan/5"><div class="tgme_widget_message_text">чужой</div></div>
</body></html>`;

describe("parseChannelPage", () => {
  const { posts, before } = parseChannelPage(PAGE, "testchan");

  it("находит посты канала, пропускает служебные и чужие", () => {
    expect(posts.map((p) => p.messageId)).toEqual([100, 101]);
    expect(before).toBe(100);
  });

  it("время публикации, просмотры, признак правки", () => {
    expect(posts[0].publishedAt.toISOString()).toBe("2026-11-06T04:02:49.000Z");
    expect(posts[0].views).toBe(16900);
    expect(posts[0].edited).toBe(false);
    expect(posts[1].edited).toBe(true);
  });

  it("картинки из background-image", () => {
    expect(posts[0].media).toEqual([{ kind: "photo", url: "https://cdn.example/photo1.jpg" }]);
  });

  it("очищенный HTML: эмодзи — символом, хэштег — абсолютной ссылкой, скрипты и обработчики вырезаны", () => {
    const html = posts[0].html;
    expect(html).toContain("🌎");
    expect(html).not.toContain("emoji");
    expect(html).toContain('href="https://t.me/s/testchan?q=%23markets"');
    expect(html).not.toMatch(/script|onclick|alert/);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("<br />");
  });

  it("плоский текст с переносами и раскодированными сущностями", () => {
    expect(posts[0].text).toBe("🌎#markets Сбер отчитался: $SBER +2%\nПодробнее: ссылка");
    expect(posts[1].text).toBe("Ставка ЦБ & рынок <без изменений>");
  });
});

describe("вспомогательные", () => {
  it("parseViews", () => {
    expect(parseViews("845")).toBe(845);
    expect(parseViews("1.2M")).toBe(1_200_000);
    expect(parseViews("")).toBeNull();
  });

  it("sanitizePostHtml не пропускает javascript: и data:", () => {
    expect(sanitizePostHtml('<a href="javascript:alert(1)">x</a><img src=x onerror=alert(1)>', "c")).toBe(
      '<a target="_blank" rel="noopener noreferrer nofollow">x</a>',
    );
  });

  it("htmlToText", () => {
    expect(htmlToText("a<br>b <b>c</b>")).toBe("a\nb c");
  });
});

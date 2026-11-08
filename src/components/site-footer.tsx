/** Подвал: источники данных, атрибуции и оговорка о том, что сервис — не инвестиционная рекомендация. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-7xl gap-1 px-4 py-6 text-xs text-muted-foreground">
        <p>
          Котировки и спецификации — <a href="https://iss.moex.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">MOEX ISS</a>{" "}
          (бесплатные данные, задержка до 15 минут). Новости —{" "}
          <a href="https://t.me/markettwits" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">t.me/markettwits</a>.
          Графики капитала —{" "}
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">TradingView Lightweight Charts</a>.
        </p>
        <p>Расчёты носят справочный характер и не являются индивидуальной инвестиционной рекомендацией.</p>
      </div>
    </footer>
  );
}

/** Ручная загрузка спецификаций MOEX ISS: pnpm moex:sync */
import "dotenv/config";
import { syncInstrumentSpecs } from "@/server/services/instruments";

syncInstrumentSpecs()
  .then(({ upserted, failedBoards }) => {
    console.log(`Загружено инструментов: ${upserted}`);
    if (failedBoards.length) console.warn(`Не загрузились режимы торгов: ${failedBoards.join(", ")}`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

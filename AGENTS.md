<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# MOEX Trader: инструкции для GPT

- Начните с README.md (запуск и ручной ввод токенов) и docs/architecture.md (карта проекта).
- Работайте на Node.js 24 с версией pnpm из package.json: `corepack pnpm install --frozen-lockfile`. Prisma-клиент и next-env.d.ts генерируются; не правьте их вручную.
- Бизнес-правила меняйте в src/core и проверяйте тестами. Для БД используйте миграции; не сбрасывайте базу пользователя. Сохраняйте изоляцию данных по userId и не выводите токены в логи.
- Для просмотра интерфейса запустите `corepack pnpm run preview:visual`. Этот режим работает без БД, API, воркера и ключей. Маршрут `/api/health` в нём возвращает 404.
- Штатный локальный запуск не требует внешних ключей. Выполните `corepack pnpm setup:local` для создания локальных секретов и используйте локальную БД. Для реальной синхронизации пользователь вручную вводит токен Т‑Инвестиций «Только для чтения» в **Кабинет → Брокеры → API-токен**. Для проверки синхронизации используйте мок и вымышленный токен. Не запрашивайте и не считывайте реальные токены. Не передавайте .env, .data, backups, отчёты и сгенерированные папки.
- Перед передачей проверьте `corepack pnpm test`, `corepack pnpm typecheck`, `corepack pnpm lint` и `corepack pnpm build`. Для сквозной проверки используйте чистую БД, /api/health, тестовый CSV и форму брокера.

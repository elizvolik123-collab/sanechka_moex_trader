#!/usr/bin/env sh
# Резервная копия базы: ./deploy/backup.sh  →  backups/moex_trader-ГГГГ-ММ-ДД_ЧЧММ.sql.gz
# Хранит 14 последних копий. Для ежедневного запуска добавьте в crontab сервера:
#   15 3 * * * cd /opt/moex-trader && ./deploy/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
file="backups/moex_trader-$(date +%Y-%m-%d_%H%M).sql.gz"
docker compose exec -T postgres pg_dump -U postgres --no-owner moex_trader | gzip > "$file"
ls -1t backups/moex_trader-*.sql.gz | tail -n +15 | xargs -r rm --
echo "Готово: $file"

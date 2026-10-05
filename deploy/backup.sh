#!/usr/bin/env bash
# Sao lưu cơ sở dữ liệu hằng ngày, giữ 30 ngày gần nhất.
# Tự nhận biết MariaDB / SQLite theo DB_CLIENT trong file .env của ứng dụng.
# Cài vào cron:  sudo crontab -e  →  30 1 * * * /opt/ptkt/deploy/backup.sh >> /var/log/ptkt-backup.log 2>&1
set -euo pipefail
APP_DIR="${APP_DIR:-/opt/ptkt}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/ptkt}"
KEEP_DAYS="${KEEP_DAYS:-30}"

# đọc cấu hình từ .env (chỉ các dòng KEY=VALUE)
if [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    export "$k=$v"
  done < <(grep -E '^[A-Z_][A-Z0-9_]*=' "$ENV_FILE")
fi
DB_CLIENT="${DB_CLIENT:-mariadb}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M)"

if [ "$DB_CLIENT" = "sqlite" ]; then
  DATA_DIR="${DATA_DIR:-/var/lib/ptkt}"
  OUT="$BACKUP_DIR/ptkt-$STAMP.db"
  sqlite3 "$DATA_DIR/ptkt.db" ".backup '$OUT'"
  gzip -f "$OUT"; OUT="$OUT.gz"
else
  OUT="$BACKUP_DIR/ptkt-$STAMP.sql.gz"
  DUMP="$(command -v mariadb-dump || command -v mysqldump)"
  MYSQL_PWD="${DB_PASSWORD:-}" "$DUMP" --single-transaction --quick --routines --default-character-set=utf8mb4 \
    -h "${DB_HOST:-127.0.0.1}" -P "${DB_PORT:-3306}" -u "${DB_USER:-ptkt}" "${DB_NAME:-ptkt}" | gzip > "$OUT"
fi
chmod 600 "$OUT"
find "$BACKUP_DIR" \( -name 'ptkt-*.db.gz' -o -name 'ptkt-*.sql.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date '+%F %T') Đã sao lưu ($DB_CLIENT): $OUT ($(du -h "$OUT" | cut -f1))"

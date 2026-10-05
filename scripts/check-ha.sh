#!/usr/bin/env bash
# Kiểm tra nhanh sức khoẻ một node trong cụm 2 máy (SERVER3/SERVER4).
# Dùng:  sudo /opt/ptkt/scripts/check-ha.sh
# Trả về mã thoát 0 nếu mọi thứ bình thường, 1 nếu có mục ✗.
APP_DIR="${APP_DIR:-/opt/ptkt}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
RC=0
ok(){ echo "  ✓ $1"; }
bad(){ echo "  ✗ $1"; RC=1; }

echo "== $(hostname) – $(date '+%F %T') =="

systemctl is-active --quiet ptkt && ok "dịch vụ ptkt: đang chạy" || bad "dịch vụ ptkt: KHÔNG chạy (journalctl -u ptkt -n 50)"
systemctl is-active --quiet nginx && ok "nginx: đang chạy" || bad "nginx: KHÔNG chạy"
systemctl is-active --quiet mariadb && ok "mariadb: đang chạy" || bad "mariadb: KHÔNG chạy"

H="$(curl -fsS --max-time 5 http://127.0.0.1/api/health 2>/dev/null)"
case "$H" in
  *'"ok":true'*) ok "api/health qua nginx: $H" ;;
  *)             bad "api/health qua nginx: không trả về ok (${H:-không phản hồi})" ;;
esac

# Trạng thái nhân bản 2 chiều
S="$(mariadb -N -B -e "SHOW SLAVE STATUS\G" 2>/dev/null)"
if [ -z "$S" ]; then
  bad "nhân bản: máy này chưa cấu hình làm slave (SHOW SLAVE STATUS rỗng)"
else
  IO="$(echo "$S"  | awk -F': ' '/Slave_IO_Running:/{print $2}'  | tr -d ' ')"
  SQL="$(echo "$S" | awk -F': ' '/Slave_SQL_Running:/{print $2}' | tr -d ' ')"
  LAG="$(echo "$S" | awk -F': ' '/Seconds_Behind_Master:/{print $2}' | tr -d ' ')"
  ERR="$(echo "$S" | awk -F': ' '/Last_Error:/{print $2}' | head -1)"
  if [ "$IO" = "Yes" ] && [ "$SQL" = "Yes" ]; then
    ok "nhân bản: IO=$IO SQL=$SQL, trễ ${LAG:-0}s"
  else
    bad "nhân bản: IO=$IO SQL=$SQL – ${ERR:-xem SHOW SLAVE STATUS\\G}"
  fi
fi

# Số tài liệu trong CSDL (so sánh con số này giữa 2 máy – phải bằng nhau)
C="$(mariadb -N -B -e "SELECT COUNT(*) FROM ptkt.docs" 2>/dev/null)"
[ -n "$C" ] && ok "số tài liệu trong bảng docs: $C" || bad "không đọc được bảng ptkt.docs"

df -h / | awk 'NR==2 {print "  • dung lượng ổ /: đã dùng " $5 " (còn " $4 ")"}'
echo
exit $RC

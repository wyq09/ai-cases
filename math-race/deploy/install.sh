#!/usr/bin/env bash
# math-race 服务器端初始化 / 升级脚本（在 175.178.188.217 上以 ubuntu 运行）
#
#   bash deploy/install.sh
#
# 幂等：重复执行只会更新 unit / nginx 片段并重启服务，不会清库。
set -euo pipefail

APP_DIR="/data/ai-cases/math-race"
DATA_DIR="/var/lib/math-race"
SERVICE="math-race"
NGINX_SITE="/etc/nginx/sites-available/case.youyongai.com.conf"
NGINX_SNIPPET="/etc/nginx/snippets/math-race.conf"

say() { printf '\033[1;32m[math-race]\033[0m %s\n' "$*"; }

say "检查代码目录 $APP_DIR"
[ -f "$APP_DIR/server.js" ] || { echo "缺少 $APP_DIR/server.js，请先 rsync 代码"; exit 1; }
[ -f "$APP_DIR/client/index.html" ] || { echo "缺少 client/index.html，请先运行 python3 build.py"; exit 1; }

say "准备数据目录 $DATA_DIR"
sudo install -d -o ubuntu -g ubuntu -m 0750 "$DATA_DIR"

say "安装 systemd 服务"
sudo install -m 0644 "$APP_DIR/deploy/math-race.service" "/etc/systemd/system/${SERVICE}.service"
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE" >/dev/null
sudo systemctl restart "$SERVICE"

say "安装 nginx 反代片段"
sudo install -d -m 0755 /etc/nginx/snippets
sudo install -m 0644 "$APP_DIR/deploy/nginx-math-race.conf" "$NGINX_SNIPPET"

if ! sudo grep -q "snippets/math-race.conf" "$NGINX_SITE"; then
  say "在 case.youyongai.com 的 server 块注入 include"
  sudo cp "$NGINX_SITE" "${NGINX_SITE}.bak.$(date +%s)"
  # 在最后一个 server 块的最后一个 } 前插入 include（静态站点的 location / 之后）
  sudo python3 - "$NGINX_SITE" <<'PY'
import sys, re
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
marker = "include /etc/nginx/snippets/math-race.conf;"
if marker in s:
    sys.exit(0)
idx = s.rfind("location / {")
if idx < 0:
    sys.exit("找不到 location / 块，请手动插入 include")
end = s.index("}", idx) + 1
s = s[:end] + "\n\n    # math-race 口算竞速场（Node 服务反代）\n    " + marker + "\n" + s[end:]
open(p, 'w', encoding='utf-8').write(s)
PY
else
  say "include 已存在，跳过"
fi

say "校验并重载 nginx"
sudo nginx -t
sudo systemctl reload nginx

say "等待服务就绪"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:8787/math-race/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

say "健康检查"
curl -fsS "http://127.0.0.1:8787/math-race/api/health"; echo
curl -fsS -o /dev/null -w "public HTTPS: %{http_code}\n" "https://case.youyongai.com/math-race/api/health"

say "完成。查看日志: sudo journalctl -u ${SERVICE} -f"

#!/usr/bin/env bash
# 夜航 Nocta — lightweight push agent
# Reads /proc for CPU / memory / disk / network and POSTs it to your Nocta instance.
# Needs only bash + curl. No passwords are ever sent or stored — only a per-server token.
#
#   one-shot test:   bash nocta-agent.sh run --server https://nav.example.com --token nct_xxx --once
#   foreground:      bash nocta-agent.sh run --server https://nav.example.com --token nct_xxx
#   install service: curl -fsSL https://nav.example.com/api/agent/script | sudo bash -s -- install --server https://nav.example.com --token nct_xxx
#   uninstall:       sudo bash nocta-agent.sh uninstall
set -u

VERSION="0.1.0"
CMD="${1:-run}"; [ $# -gt 0 ] && shift
SERVER="${NOCTA_SERVER:-}"
TOKEN="${NOCTA_TOKEN:-}"
INTERVAL="${NOCTA_INTERVAL:-30}"
DISK_PATH="${NOCTA_DISK:-/}"
ONCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --server) SERVER="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --disk) DISK_PATH="$2"; shift 2 ;;
    --once) ONCE=1; shift ;;
    -h|--help) sed -n '2,10p' "$0" 2>/dev/null; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
SERVER="${SERVER%/}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "nocta-agent: '$1' is required" >&2; exit 1; }; }

cpu_times() { # prints "idle total"
  read -r _ u n s i w q sq st _ < /proc/stat
  echo "$((i + w)) $((u + n + s + i + w + q + sq + st))"
}

net_bytes() { # prints "rx tx" summed over non-loopback, non-virtual interfaces
  awk 'NR>2 { sub(/^ +/, ""); split($0, a, /[: ]+/); if (a[1] ~ /^(lo|docker|veth|br-|virbr|cni|flannel|cali|tun|tap)/) next; rx += a[2]; tx += a[10] } END { printf "%.0f %.0f\n", rx, tx }' /proc/net/dev
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n\r'; }

collect_and_send() {
  local idle1 total1 idle2 total2 rx1 tx1 rx2 tx2
  read -r idle1 total1 < <(cpu_times)
  read -r rx1 tx1 < <(net_bytes)
  sleep 1
  read -r idle2 total2 < <(cpu_times)
  read -r rx2 tx2 < <(net_bytes)

  local dt_total=$((total2 - total1)) dt_idle=$((idle2 - idle1))
  local cpu="0"
  [ "$dt_total" -gt 0 ] && cpu=$(awk -v t="$dt_total" -v i="$dt_idle" 'BEGIN { printf "%.1f", (t - i) * 100 / t }')
  local secs=1 # sampled over `sleep 1`
  local rx_rate tx_rate
  rx_rate=$(awk -v a="$rx1" -v b="$rx2" -v s="$secs" 'BEGIN { r = (b - a) / s; if (r < 0) r = 0; printf "%.0f", r }')
  tx_rate=$(awk -v a="$tx1" -v b="$tx2" -v s="$secs" 'BEGIN { r = (b - a) / s; if (r < 0) r = 0; printf "%.0f", r }')

  local mem_total mem_avail
  mem_total=$(awk '/^MemTotal:/ { printf "%.0f", $2 * 1024 }' /proc/meminfo)
  mem_avail=$(awk '/^MemAvailable:/ { printf "%.0f", $2 * 1024 }' /proc/meminfo)
  [ -z "$mem_avail" ] && mem_avail=$(awk '/^(MemFree|Buffers|Cached):/ { s += $2 } END { printf "%.0f", s * 1024 }' /proc/meminfo)
  local mem_used=$((mem_total - mem_avail))

  local disk_total disk_used
  read -r disk_total disk_used < <(df -P -k "$DISK_PATH" 2>/dev/null | awk 'NR==2 { printf "%.0f %.0f\n", $2 * 1024, $3 * 1024 }')

  local uptime load host os kernel
  uptime=$(awk '{ printf "%d", $1 }' /proc/uptime)
  load=$(awk '{ print $1" "$2" "$3 }' /proc/loadavg)
  host=$(hostname 2>/dev/null || cat /proc/sys/kernel/hostname)
  os=$( (. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-$NAME}") || uname -s)
  kernel=$(uname -r)

  local payload
  payload=$(printf '{"agent":"%s","hostname":"%s","os":"%s","kernel":"%s","uptime":%s,"load":"%s","cpu":%s,"mem_total":%s,"mem_used":%s,"disk_total":%s,"disk_used":%s,"rx_rate":%s,"tx_rate":%s}' \
    "$VERSION" "$(json_escape "$host")" "$(json_escape "$os")" "$(json_escape "$kernel")" "${uptime:-0}" "$load" "$cpu" \
    "${mem_total:-0}" "${mem_used:-0}" "${disk_total:-0}" "${disk_used:-0}" "${rx_rate:-0}" "${tx_rate:-0}")

  local resp
  resp=$(curl -fsS -m 10 -X POST "$SERVER/api/agent/report" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data "$payload" 2>&1) || { echo "nocta-agent: report failed: $resp" >&2; return 1; }
  # the server may change our interval from the UI
  local srv_int
  srv_int=$(printf '%s' "$resp" | sed -n 's/.*"interval":\([0-9]*\).*/\1/p')
  [ -n "$srv_int" ] && [ "$srv_int" -ge 10 ] && INTERVAL="$srv_int"
  [ "$ONCE" = 1 ] && echo "nocta-agent: ok → $resp"
  return 0
}

run() {
  need curl; need awk
  [ -r /proc/stat ] || { echo "nocta-agent: /proc not available (Linux only)" >&2; exit 1; }
  [ -n "$SERVER" ] && [ -n "$TOKEN" ] || { echo "usage: $0 run --server URL --token TOKEN" >&2; exit 2; }
  if [ "$ONCE" = 1 ]; then collect_and_send; exit $?; fi
  echo "nocta-agent $VERSION → $SERVER every ${INTERVAL}s"
  while true; do
    collect_and_send || true
    sleep "$(( INTERVAL > 1 ? INTERVAL - 1 : 1 ))"
  done
}

install_service() {
  [ "$(id -u)" = 0 ] || { echo "please run install as root (sudo)" >&2; exit 1; }
  need curl
  [ -n "$SERVER" ] && [ -n "$TOKEN" ] || { echo "usage: install --server URL --token TOKEN" >&2; exit 2; }
  curl -fsSL "$SERVER/api/agent/script" -o /usr/local/bin/nocta-agent || { echo "download failed" >&2; exit 1; }
  chmod 755 /usr/local/bin/nocta-agent
  mkdir -p /etc/nocta
  umask 077
  printf 'NOCTA_SERVER=%s\nNOCTA_TOKEN=%s\nNOCTA_INTERVAL=%s\nNOCTA_DISK=%s\n' "$SERVER" "$TOKEN" "$INTERVAL" "$DISK_PATH" > /etc/nocta/agent.env
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    cat > /etc/systemd/system/nocta-agent.service <<UNIT
[Unit]
Description=Nocta monitoring agent
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=/etc/nocta/agent.env
ExecStart=/usr/local/bin/nocta-agent run
Restart=always
RestartSec=10
DynamicUser=yes
NoNewPrivileges=yes

[Install]
WantedBy=multi-user.target
UNIT
    systemctl daemon-reload
    systemctl enable --now nocta-agent
    echo "✓ nocta-agent installed and running (systemctl status nocta-agent)"
  else
    nohup /usr/local/bin/nocta-agent run --server "$SERVER" --token "$TOKEN" --interval "$INTERVAL" >/var/log/nocta-agent.log 2>&1 &
    echo "✓ nocta-agent started in background (no systemd found; add it to your init system to survive reboots)"
  fi
  NOCTA_SERVER="$SERVER" NOCTA_TOKEN="$TOKEN" /usr/local/bin/nocta-agent run --once || true
}

uninstall_service() {
  [ "$(id -u)" = 0 ] || { echo "please run as root (sudo)" >&2; exit 1; }
  systemctl disable --now nocta-agent 2>/dev/null || true
  rm -f /etc/systemd/system/nocta-agent.service /usr/local/bin/nocta-agent
  rm -rf /etc/nocta
  systemctl daemon-reload 2>/dev/null || true
  pkill -f "nocta-agent run" 2>/dev/null || true
  echo "✓ nocta-agent removed"
}

case "$CMD" in
  run) run ;;
  install) install_service ;;
  uninstall) uninstall_service ;;
  version) echo "$VERSION" ;;
  *) echo "usage: $0 {run|install|uninstall|version} [--server URL] [--token TOKEN] [--interval SEC] [--once]" >&2; exit 2 ;;
esac

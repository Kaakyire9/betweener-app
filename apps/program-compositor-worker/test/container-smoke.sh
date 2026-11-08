#!/bin/sh
set -eu

runtime="$(mktemp -d /tmp/compositor-security.XXXXXX)"
export HOME="$runtime/home"
export XDG_CONFIG_HOME="$runtime/config"
export XDG_CACHE_HOME="$runtime/cache"
export XDG_RUNTIME_DIR="$runtime/pulse-runtime"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_RUNTIME_DIR"
chmod 0700 "$XDG_RUNTIME_DIR"

cleanup() {
  for pid in ${worker_pid:-} ${server_pid:-} ${ffmpeg_pid:-} ${xvfb_pid:-}; do
    if [ -n "$pid" ]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  rm -rf "$runtime"
}
trap cleanup EXIT INT TERM

pulseaudio --daemonize=yes --exit-idle-time=-1 --disallow-exit --log-level=warning
export PULSE_SERVER="unix:$XDG_RUNTIME_DIR/pulse/native"
attempt=0
until pactl info >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then echo 'PulseAudio did not become ready.' >&2; exit 1; fi
  sleep 0.1
done
pactl load-module module-null-sink sink_name=betweener_smoke >/dev/null

display=77
for dimensions in 1280x720 720x1280 1080x1080; do
  Xvfb ":$display" -screen 0 "${dimensions}x24" -nolisten tcp -noreset >/dev/null 2>&1 &
  xvfb_pid=$!
  attempt=0
  until [ -S "/tmp/.X11-unix/X$display" ]; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge 50 ]; then echo "Xvfb failed for $dimensions." >&2; exit 1; fi
    sleep 0.1
  done
  ffmpeg -hide_banner -loglevel error -nostats \
    -thread_queue_size 1024 \
    -f x11grab -draw_mouse 0 -framerate 30 -video_size "$dimensions" -i ":$display.0" \
    -thread_queue_size 2048 \
    -f pulse -i betweener_smoke.monitor \
    -t 1 -map 0:v:0 -map 1:a:0 \
    -c:v libx264 -preset veryfast -tune zerolatency \
    -profile:v high -level 4.1 -pix_fmt yuv420p \
    -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
    -b:v 4500k -maxrate 5000k -bufsize 9000k \
    -c:a aac -ar 48000 -ac 2 -b:a 160k \
    -af aresample=async=1:first_pts=0 \
    -flvflags no_duration_filesize -f flv "$runtime/${dimensions}.flv"
  test "$(stat -c '%s' "$runtime/${dimensions}.flv")" -gt 1000
  test "$(head -c 3 "$runtime/${dimensions}.flv")" = 'FLV'
  kill -TERM "$xvfb_pid"
  wait "$xvfb_pid" || true
  unset xvfb_pid
  display=$((display + 1))
done

Xvfb ":$display" -screen 0 "1280x720x24" -nolisten tcp -noreset >/dev/null 2>&1 &
xvfb_pid=$!
attempt=0
until [ -S "/tmp/.X11-unix/X$display" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 50 ]; then echo 'Xvfb failed for termination test.' >&2; exit 1; fi
  sleep 0.1
done
ffmpeg -hide_banner -loglevel error -nostats \
  -f x11grab -draw_mouse 0 -framerate 30 -video_size 1280x720 -i ":$display.0" \
  -f pulse -i betweener_smoke.monitor \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -r 30 -g 60 -keyint_min 60 -sc_threshold 0 \
  -b:v 4500k -maxrate 5000k -bufsize 9000k \
  -c:a aac -ar 48000 -ac 2 -b:a 160k \
  -flvflags no_duration_filesize -f flv "$runtime/termination.flv" &
ffmpeg_pid=$!
sleep 2
if ! kill -0 "$ffmpeg_pid" 2>/dev/null; then
  echo 'FFmpeg exited before the termination signal.' >&2
  wait "$ffmpeg_pid"
  exit 1
fi
kill -INT "$ffmpeg_pid"
wait "$ffmpeg_pid" || true
unset ffmpeg_pid
test "$(stat -c '%s' "$runtime/termination.flv")" -gt 1000
test "$(head -c 3 "$runtime/termination.flv")" = 'FLV'
kill -TERM "$xvfb_pid"
wait "$xvfb_pid" || true
unset xvfb_pid

node -e "const http=require('node:http');http.createServer((_,r)=>{r.end('<!doctype html><title>Betweener</title><main>Program renderer ready</main>')}).listen(18082,'127.0.0.1')" &
server_pid=$!
"$CHROMIUM_PATH" --headless --no-sandbox --disable-dev-shm-usage --disable-gpu \
  --user-data-dir="$runtime/chromium" --window-size=1280,720 \
  --screenshot="$runtime/chromium.png" http://127.0.0.1:18082 >/dev/null 2>&1
test "$(stat -c '%s' "$runtime/chromium.png")" -gt 1000
kill -TERM "$server_pid"
wait "$server_pid" || true
unset server_pid

node -e "const http=require('node:http');http.createServer(async(req,res)=>{for await(const chunk of req)void chunk;res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,work:[]}))}).listen(18081,'127.0.0.1')" &
server_pid=$!
SUPABASE_URL=http://127.0.0.1:18081 \
  BROADCAST_COMPOSITOR_WORKER_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  PORT=18080 node /app/src/worker.mjs >"$runtime/worker.log" 2>&1 &
worker_pid=$!
node -e "const deadline=Date.now()+15000;(async()=>{while(Date.now()<deadline){try{const r=await fetch('http://127.0.0.1:18080/healthz');if(r.ok){const b=await r.json();if(b.healthy===true)process.exit(0)}}catch{}await new Promise(x=>setTimeout(x,100))}process.exit(1)})()"
kill -TERM "$worker_pid"
wait "$worker_pid"
unset worker_pid
grep -q '"event":"worker_stopping"' "$runtime/worker.log"

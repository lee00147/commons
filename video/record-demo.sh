#!/bin/bash
# Records the Commons demo video with one command: the website, a live compute
# job in Terminal, its transaction in Solana Explorer, and the Commons app
# buying, verifying, installing and opening apps by itself.
#
#   ./record-demo.sh
#
# Only the demo's own windows are recorded (one new Safari window, one new
# Terminal window and the Commons app), so other apps, the desktop, the menu
# bar and the pointer never appear, even if something covers the demo windows.
# Output: ~/Desktop/Commons-demo-<date>.mp4, 1920×1080, about 2½ minutes.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
TOKEN="$HOME/Desktop/commons-token"
APPDIR="$HOME/Desktop/commons-app/macos"
SITE="https://interactiveapps.net"
OUT="${OUT:-$HOME/Desktop/Commons-demo-$(date +%Y%m%d-%H%M).mp4}"
WORK="$HERE/.work"
ALLOW="$WORK/allow"
REC="$WORK/rec"

step() { printf '\033[1m▸ %s\033[0m\n' "$1"; }
fail() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

RECPID=""; TW=""; OLD_FONT=""
cleanup() {
  if [ -n "$RECPID" ] && kill -0 "$RECPID" 2>/dev/null; then
    kill -INT "$RECPID"
    for _ in $(seq 1 40); do kill -0 "$RECPID" 2>/dev/null || break; sleep 0.25; done
  fi
  if [ -n "$TW" ] && [ -n "$OLD_FONT" ]; then
    osascript -e "tell application \"Terminal\" to set font size of current settings of selected tab of window id $TW to $OLD_FONT" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

mkdir -p "$WORK"
: > "$ALLOW"

step "Building the recorder and the Commons app"
if [ ! -x "$REC" ] || [ "$HERE/rec.swift" -nt "$REC" ]; then
  swiftc -O -swift-version 5 "$HERE/rec.swift" -o "$REC"
fi
(cd "$APPDIR" && swift build -c release >/dev/null)
APP_BIN="$(cd "$APPDIR" && swift build -c release --show-bin-path)/Commons"

step "Funding a fresh buyer wallet for the app scene"
BUYER="$(cd "$TOKEN" && node scripts/fresh-buyer.mjs | tail -1)"
[ -f "$BUYER" ] || fail "Could not fund a buyer wallet (see the error above)"
rm -f "$TOKEN/.demo/live-done" "$TOKEN/.demo/last-settle.txt"

BOUNDS="$("$REC" --bounds)"   # "left, top, right, bottom" of the recorded area
FRAME="${BOUNDS// /}"

step "Opening the demo windows"
SW="$(osascript <<OSA
tell application "Safari"
  make new document with properties {URL:"$SITE"}
  delay 1
  set bounds of front window to {$BOUNDS}
  return id of front window
end tell
OSA
)"
TERM_INFO="$(osascript <<OSA
tell application "Terminal"
  set t to do script "clear"
  delay 0.6
  set w to front window
  set oldSize to font size of current settings of t
  set font size of current settings of t to 18
  delay 0.3
  set bounds of w to {$BOUNDS}
  return (id of w as text) & " " & (oldSize as text)
end tell
OSA
)"
read -r TW OLD_FONT <<< "$TERM_INFO"
printf '%s\n%s\n' "$SW" "$TW" > "$ALLOW"

safari_go() {
  osascript -e "tell application \"Safari\" to set URL of current tab of window id $SW to \"$1\"" >/dev/null
}
safari_front() {
  osascript -e 'tell application "Safari"' -e "set index of window id $SW to 1" -e 'activate' -e 'end tell' >/dev/null
}
safari_front
sleep 4

step "Recording to $OUT"
echo "  Hands off the demo windows until it says Saved. Other apps are not recorded."
"$REC" "$OUT" "$ALLOW" --max 360 > "$WORK/rec.out" 2> "$WORK/rec.log" &
RECPID=$!
for _ in $(seq 1 120); do
  grep -q recording "$WORK/rec.out" 2>/dev/null && break
  kill -0 "$RECPID" 2>/dev/null || { cat "$WORK/rec.log" >&2; fail "The recorder stopped before it started"; }
  sleep 0.5
done
grep -q recording "$WORK/rec.out" || fail "The recorder did not start. If macOS asked about screen recording, allow it and run again."
sleep 1

# 1. The website
sleep 6
safari_go "$SITE/#how"
sleep 7

# 2. A live compute job in Terminal
osascript >/dev/null <<OSA
tell application "Terminal"
  do script "clear; cd '$TOKEN' && node scripts/demo-live.mjs" in selected tab of window id $TW
  set index of window id $TW to 1
  activate
end tell
OSA
for _ in $(seq 1 300); do [ -f "$TOKEN/.demo/live-done" ] && break; sleep 0.5; done
[ -f "$TOKEN/.demo/live-done" ] || echo "  (the live job did not finish; continuing)"
sleep 3

# 3. The settlement in Solana Explorer (loads behind Terminal first)
if [ -f "$TOKEN/.demo/last-settle.txt" ]; then
  safari_go "https://explorer.solana.com/tx/$(cat "$TOKEN/.demo/last-settle.txt")?cluster=devnet"
  sleep 3
  safari_front
  sleep 9
fi

# 4. The Commons app drives itself
"$APP_BIN" --demo --wallet "$BUYER" --frame "$FRAME" > "$WORK/app.log" 2>&1 &
APP=$!
echo "pid $APP" >> "$ALLOW"
for _ in $(seq 1 240); do kill -0 "$APP" 2>/dev/null || break; sleep 0.5; done
kill "$APP" 2>/dev/null || true

# 5. Back to the website
safari_go "$SITE"
sleep 2
safari_front
sleep 5

# Stop and save the recording.
kill -INT "$RECPID"
for _ in $(seq 1 60); do kill -0 "$RECPID" 2>/dev/null || break; sleep 0.25; done
if kill -0 "$RECPID" 2>/dev/null; then
  kill -9 "$RECPID"; RECPID=""
  fail "The recorder did not finish the movie. Details: $WORK/rec.log"
fi
if ! wait "$RECPID"; then
  RECPID=""
  cat "$WORK/rec.log" >&2
  fail "The recorder reported an error"
fi
RECPID=""

# Put things back.
osascript >/dev/null 2>&1 <<OSA || true
tell application "Terminal"
  set font size of current settings of selected tab of window id $TW to $OLD_FONT
  close window id $TW
end tell
tell application "Safari" to close window id $SW
OSA
TW=""

step "Saved $OUT"
open -R "$OUT"

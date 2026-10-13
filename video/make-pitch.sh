#!/bin/bash
# Adds narration (macOS text-to-speech) to the pitch film and saves the video.
#
#   ./make-pitch.sh                      default voice
#   VOICE="Ava (Premium)" ./make-pitch.sh  a nicer voice, if installed
#                                         (System Settings → Accessibility → Spoken Content → System voice → Manage Voices)
set -euo pipefail
cd "$(dirname "$0")"
VOICE="${VOICE:-Samantha}"
RATE="${RATE:-172}"
OUT="${OUT:-$HOME/Desktop/Commons-pitch-$(date +%Y%m%d-%H%M).mp4}"
TMP="$(mktemp -d)"

if ! say -v '?' | grep -q "^$VOICE "; then
  echo "Voice \"$VOICE\" is not installed; using the system voice."
  VOICE=""
fi

echo "▸ Narrating"
: > "$TMP/timeline.txt"
n=0
while IFS=$'\t' read -r start text; do
  [ -z "$start" ] && continue
  n=$((n + 1))
  if [ -n "$VOICE" ]; then say -v "$VOICE" -r "$RATE" -o "$TMP/line$n.aiff" "$text"; else say -r "$RATE" -o "$TMP/line$n.aiff" "$text"; fi
  echo "$start $TMP/line$n.aiff" >> "$TMP/timeline.txt"
done < pitch/narration.tsv

echo "▸ Putting it together"
swift pitch/mux.swift pitch/pitch-silent.mp4 "$TMP/timeline.txt" "$OUT"
rm -rf "$TMP"
echo "✓ $OUT"
open -R "$OUT"

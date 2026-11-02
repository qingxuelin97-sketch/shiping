#!/usr/bin/env bash
# 分段渲染成片（可续跑）：每 CH 秒一段单独输出到 build/chunks/，已完成且帧数正确的段直接跳过；
# 全部完成后无损拼接成 build/video.mp4。机器重启或进程中断后重新运行本脚本即可接着渲染。
set -euo pipefail
cd "$(dirname "$0")/.."
CH=${CH:-36}
FPS=24
mkdir -p build/chunks
node render/stills.mjs --cues build/cues.json > /dev/null 2>&1
DUR=$(python3 -I -c "import json; print(json.load(open('build/cues.json'))['duration'])")
N=$(python3 -I -c "import math; print(math.ceil(${DUR} / ${CH}))")
LIST=build/chunks/list.txt
: > "$LIST"
for ((k = 0; k < N; k++)); do
  FROM=$((k * CH))
  TO=$(python3 -I -c "print(min(($k + 1) * $CH, ${DUR}))")
  WANT=$(python3 -I -c "print(round(${TO} * ${FPS}) - ${FROM} * ${FPS})")
  OUT=build/chunks/c$(printf %02d "$k").mp4
  HAVE=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "$OUT" 2>/dev/null || echo 0)
  if [ "$HAVE" = "$WANT" ]; then
    echo "段 $k（${FROM}–${TO}s）已完成，跳过"
  else
    echo "段 $k（${FROM}–${TO}s）渲染 $WANT 帧"
    rm -rf "$OUT" "build/chunks/c$(printf %02d "$k")_segs"
    node render/render.mjs --from "$FROM" --to "$TO" --out "$OUT" --workers "${WORKERS:-4}" 2>&1 | grep -v "GL Driver" | tail -2
    HAVE=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "$OUT")
    [ "$HAVE" = "$WANT" ] || { echo "段 $k 帧数不对：$HAVE ≠ $WANT"; exit 1; }
  fi
  echo "file '$(pwd)/$OUT'" >> "$LIST"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i "$LIST" -c copy -movflags +faststart build/video.mp4
echo "完成 → build/video.mp4  $(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 build/video.mp4) 帧"

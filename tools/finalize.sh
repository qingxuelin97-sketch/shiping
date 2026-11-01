#!/usr/bin/env bash
# 把高质量画面（build/video.mp4）和混好的音轨（build/audio/final.wav）封装成成片。
# 两遍编码，控制在 GitHub 单文件 100MB 以内（默认目标 88MB）。
set -euo pipefail
cd "$(dirname "$0")/.."
VIDEO=${1:-build/video.mp4}
AUDIO=${2:-build/audio/final.wav}
OUT=${3:-output/the-paper-kite_1080p.mp4}
TARGET_MB=${TARGET_MB:-88}
mkdir -p "$(dirname "$OUT")" build/pass
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
AUDIO_K=192
VK=$(python3 -c "print(int(${TARGET_MB}*8*1024*1024/${DUR}/1000 - ${AUDIO_K} - 40))")
echo "时长 ${DUR}s，视频码率 ${VK}k"
COMMON=(-c:v libx264 -preset slow -tune animation -b:v "${VK}k" -maxrate "$((VK * 2))k" -bufsize "$((VK * 4))k" -pix_fmt yuv420p -profile:v high -level 4.1 -g 48 -bf 3)
ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" "${COMMON[@]}" -pass 1 -passlogfile build/pass/x264 -an -f mp4 /dev/null
ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" -i "$AUDIO" "${COMMON[@]}" -pass 2 -passlogfile build/pass/x264 \
  -c:a aac -b:a "${AUDIO_K}k" -ar 48000 -ac 2 -shortest -movflags +faststart \
  -metadata title="纸鸢 The Paper Kite" -metadata comment="2D ink-wash animated short, made in code" "$OUT"
ls -la "$OUT"

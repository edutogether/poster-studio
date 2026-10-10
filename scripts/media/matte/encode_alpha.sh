#!/usr/bin/env bash
# 최종 RGBA 프레임을 투명도가 살아 있는 WebM(VP9 알파)으로 묶는다 — 결정 119의 04번 시험 영상과 같은 설정(24fps·crf 28).
# 사용: bash encode_alpha.sh <최종 RGBA 프레임 폴더> <출력 webm>
set -euo pipefail
FRAMES="$1"; OUT="$2"
ffmpeg -v error -y -framerate 24 -i "$FRAMES/%03d.png" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 28 -row-mt 1 -an "$OUT"
ALPHA="$(ffprobe -v error -show_entries stream_tags=alpha_mode -of default=nw=1:nk=1 "$OUT")"
[ "$ALPHA" = "1" ] || { echo "투명도가 빠졌다(alpha_mode=$ALPHA): $OUT" >&2; exit 1; }
echo "$OUT · $(stat -c %s "$OUT")바이트 · 투명도 있음"

#!/usr/bin/env bash
# Veo 16:9 영상(1280×720)에서 가운데 정사각형을 잘라 704×704 프레임 PNG와 확인용 MP4를 만든다.
# Veo 출력의 맨 아래 한 줄(719행)이 거의 검정(평균 11)이라 그대로 자르면 영상 밑에 검은 줄이 남는다
# → fillborders로 그 한 줄을 바로 위 줄로 메운 뒤 자른다(크기·위치는 그대로).
# 사용: bash extract_square.sh <원본 mp4> <프레임 폴더> <확인용 mp4>
set -euo pipefail
SRC="$1"; FRAMES="$2"; MP4="$3"
VF="fillborders=bottom=1:mode=smear,crop=720:720:280:0,scale=704:704"
mkdir -p "$FRAMES"
ffmpeg -v error -y -i "$SRC" -vf "$VF" "$FRAMES/%03d.png"
ffmpeg -v error -y -i "$SRC" -vf "$VF" -c:v libx264 -crf 18 -pix_fmt yuv420p -an "$MP4"
echo "$(ls "$FRAMES" | wc -l)장 · $MP4"

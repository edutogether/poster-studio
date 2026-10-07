#!/usr/bin/env bash
# 얼굴 보정을 다시 한 장면의 누끼를 다시 딴다 — 바뀐 프레임만 AI 투명도를 새로 계산하고, 그다음 단계는 전부 다시 돈다.
# 왜(2026-10-08): AI 투명도(BiRefNet)는 한 장에 약 20초라 192장을 다시 돌리면 한 편에 1시간이 넘는다. 얼굴 보정은 얼굴판 안쪽만
# 바꾸지만 그래도 투명도가 바뀐다(06번 118번 실측: 최대 5/255, 141화소) — 그래서 옛 투명도를 그대로 쓰지 않고, 바뀐 프레임만
# 새로 계산한다(같은 입력이면 결과가 화소 차이 0이라 안 바뀐 프레임의 옛 투명도는 그대로 맞다). 다듬기·안정화는 앞뒤 프레임을 보므로 전부 다시 한다.
# 사용: bash scripts/media/matte/rematte_changed.sh <장면> <새 보정 프레임 폴더> <장면 작업 폴더(final-in·final이 있는 곳)>
set -euo pipefail
S=$1; NEW=$2; D=$3
HERE=$(cd "$(dirname "$0")" && pwd); ROOT=$(cd "$HERE/../../.." && pwd)
PY=${PY:-$ROOT/.cache/tools/rembg-venv/Scripts/python}; export PYTHONIOENCODING=utf-8
F=$D/final-in; O=$D/final
[ -d "$F" ] && [ -d "$O/ai" ] || { echo "옛 결과가 없다: $F, $O/ai — 처음부터 run_scene.sh로 돌린다"; exit 2; }
n=$(ls "$NEW"/*.png | wc -l); [ "$n" -eq "$(ls "$F"/*.png | wc -l)" ] || { echo "프레임 수가 다르다: $NEW $n장"; exit 2; }
changed=0
for f in "$NEW"/*.png; do
  b=$(basename "$f")
  if ! cmp -s "$f" "$F/$b"; then cp "$f" "$F/$b"; rm -f "$O/ai/$b"; changed=$((changed+1)); fi
done
echo "바뀐 프레임 $changed장"
"$PY" "$HERE/matte_frames.py" "$F" "$O/ai"
rm -rf "$O/refined" "$O/rgba"
"$PY" "$HERE/refine_frames.py" "$F" "$O/ai" "$O/refined" 1.6
"$PY" "$HERE/stabilize_edges.py" "$S" "$F" "$O/refined" "$O/rgba"
bash "$HERE/encode_alpha.sh" "$O/rgba" "$O/$S.webm"
"$PY" "$HERE/edge_metrics.py" "$S" "$F" "$O/rgba"

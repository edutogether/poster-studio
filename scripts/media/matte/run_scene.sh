#!/usr/bin/env bash
# 대기 영상 한 편의 누끼를 12편 기준(2026-10-06 Bumm님 결정 86·101·102·119)대로 만든다.
# 유료 생성은 하지 않는다 — 승인을 받아 만든 Veo 원본 mp4를 받은 뒤 돌린다.
#   1 가운데 정사각형 704 프레임 → 2 AI 투명도(BiRefNet) → 3 다듬기(트라이맵·클로즈드폼·배경 섞임 걷기, 그림자 ×1.6)
#   → 4 가장자리 안정화(scenes.json) → 5 VP9 알파 → 6 가장자리 측정 → 7 얼굴 요소 검사(원화에 없는 눈썹·입이면 탈락)
# 마지막은 사람 확인이다 — 확인 페이지에서 원본 화소 4배로 본다(README.md).
# 사용: bash scripts/media/matte/run_scene.sh <장면 01~12> <Veo 원본 mp4> <작업 폴더>
#       PYTHON으로 파이썬을 바꿀 수 있다(기본: .cache/tools/rembg-venv — 설치는 README.md)
set -euo pipefail
SCENE="$1"; SRC="$2"; WORK="$3"
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/../../.." && pwd)"
PY="${PYTHON:-$ROOT/.cache/tools/rembg-venv/Scripts/python}"
[ -x "$PY" ] || [ -x "$PY.exe" ] || PY="$ROOT/.cache/tools/rembg-venv/bin/python"
export PYTHONIOENCODING=utf-8
mkdir -p "$WORK"
bash "$HERE/extract_square.sh" "$SRC" "$WORK/frames" "$WORK/check.mp4"
"$PY" "$HERE/matte_frames.py" "$WORK/frames" "$WORK/ai"
"$PY" "$HERE/refine_frames.py" "$WORK/frames" "$WORK/ai" "$WORK/refined" 1.6
"$PY" "$HERE/stabilize_edges.py" "$SCENE" "$WORK/frames" "$WORK/refined" "$WORK/final"
bash "$HERE/encode_alpha.sh" "$WORK/final" "$WORK/$SCENE.webm"
"$PY" "$HERE/edge_metrics.py" "$SCENE" "$WORK/frames" "$WORK/final"
set +e
"$PY" "$ROOT/scripts/media/check-face-elements.py" "$SCENE" "$WORK/check.mp4" --json "$WORK/face-check.json"
FACE=$?
set -e
case "$FACE" in
  0) echo "장면 $SCENE: 자동 단계 통과 — 확인 페이지에서 사람이 본다" ;;
  3) echo "장면 $SCENE: 얼굴 검사 — 눈빛이 안 보인 프레임은 사람이 본다(종료 코드 3)"; exit 3 ;;
  *) echo "장면 $SCENE: 얼굴 검사 탈락(종료 코드 $FACE) — 원화에 없는 얼굴 요소가 있다"; exit "$FACE" ;;
esac

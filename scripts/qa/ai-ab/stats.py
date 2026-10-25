# AI 품질 A/B — 그림 통계(디코딩 · 크기 · 아래 1/3 밝기 · 결 밀도). python -I stats.py <이미지...> → JSON 한 줄씩
import json, sys
from PIL import Image, ImageFilter, ImageStat

# 파일 경로에 한글이 있으면 윈도 기본 출력 인코딩(cp949)이 글자를 깨 check.mjs가 결과를 파일과 짝짓지 못한다(10/25 실측 — 108장 모두 «디코딩 실패»).
# -I는 PYTHON* 환경변수를 무시하므로 여기서 직접 UTF-8로 내보낸다.
sys.stdout.reconfigure(encoding="utf-8")

for p in sys.argv[1:]:
    r = {"file": p}
    try:
        im = Image.open(p)
        im.load()
        r["ok"] = True
        r["size"] = list(im.size)
        g = im.convert("L")
        w, h = g.size
        top, bot = g.crop((0, 0, w, h * 2 // 3)), g.crop((0, h * 2 // 3, w, h))
        edges = g.filter(ImageFilter.FIND_EDGES)
        et, eb = edges.crop((0, 0, w, h * 2 // 3)), edges.crop((0, h * 2 // 3, w, h))
        r["lumaTop"] = round(ImageStat.Stat(top).mean[0], 1)
        r["lumaBottom"] = round(ImageStat.Stat(bot).mean[0], 1)
        r["edgeTop"] = round(ImageStat.Stat(et).mean[0], 2)
        r["edgeBottom"] = round(ImageStat.Stat(eb).mean[0], 2)
    except Exception as e:  # 손상 · 디코딩 실패도 결과로 남긴다
        r["ok"] = False
        r["error"] = str(e)[:200]
    print(json.dumps(r, ensure_ascii=False))

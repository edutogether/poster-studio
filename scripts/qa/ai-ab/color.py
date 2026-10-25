# AI 품질 A/B — 색감 · 구도 수치(사람 판단을 돕는 자동 측정 — 얼굴 검출 상자의 자리 · 밝기만 쓰고, 누구인지는 보지 않는다).
#   python -I color.py <checks.json> <그림 폴더> <출력 json>
# 그림마다(1024×1536 생성 그림):
#   gold        황금빛 · 주황 화소 비율(색상 20~50°, 채도 ≥ 0.35, 밝기 ≥ 0.35) — «누런 노을 · 황금빛 과다»
#   teal        청록 · 푸른 화소 비율(색상 170~230°, 채도 ≥ 0.30, 밝기 ≥ 0.20) — «푸르딩딩»
#   warm        평균 R − 평균 B(0~255) — 화면 전체가 누렇게 기운 정도
#   sat         평균 채도(아주 어두운 화소 빼고, 0~1) · contrast 밝기 표준편차 · luma 평균 밝기 — 채도와 대비가 함께 낮으면 «탁함»
#   faceLuma    검출 얼굴 상자 안 평균 밝기 · faceSat 채도 — «얼굴이 어둡다 · 탁하다»
#   faceCx      얼굴(들) 가운데의 가로 위치(0~1) — 혼자에서 «얼굴 쏠림»
#   bottomLuma  아래 1/3 평균 밝기 · bottomBlack 아래 1/3에서 거의 검은 화소(밝기 < 16) 비율 — 뮤지컬 «검은 띠»
import json, os, sys
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
checks_path, img_dir, out_path = sys.argv[1:4]
checks = json.load(open(checks_path, encoding="utf-8"))


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rm, gm, bm = m & (mx == r), m & (mx == g) & (mx != r), m & (mx == b) & (mx != r) & (mx != g)
    h[rm] = ((g - b)[rm] / d[rm]) % 6
    h[gm] = (b - r)[gm] / d[gm] + 2
    h[bm] = (r - g)[bm] / d[bm] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h * 60, s, mx


out = []
for c in checks:
    p = os.path.join(img_dir, c["file"])
    if not os.path.exists(p):
        continue
    rgb = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255
    H, W = rgb.shape[:2]
    luma = (rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)) * 255
    h, s, v = hsv(rgb)
    lit = v > 0.12
    r = {
        "caseId": c["caseId"], "arm": c["arm"], "file": c["file"],
        "gold": round(float(((h >= 20) & (h <= 50) & (s >= 0.35) & (v >= 0.35)).mean()), 4),
        "teal": round(float(((h >= 170) & (h <= 230) & (s >= 0.30) & (v >= 0.20)).mean()), 4),
        "warm": round(float((rgb[..., 0].mean() - rgb[..., 2].mean()) * 255), 1),
        "sat": round(float(s[lit].mean()) if lit.any() else 0.0, 3),
        "contrast": round(float(luma.std()), 1),
        "luma": round(float(luma.mean()), 1),
    }
    bot = luma[H * 2 // 3:]
    r["bottomLuma"] = round(float(bot.mean()), 1)
    r["bottomBlack"] = round(float((bot < 16).mean()), 3)
    faces = [f for f in (c.get("faces") or []) if f[2] * f[3] >= (W * 0.03) * (H * 0.02)]
    if faces:
        fl, fs = [], []
        for x, y, w, hh in faces:
            x0, y0, x1, y1 = max(0, int(x)), max(0, int(y)), min(W, int(x + w)), min(H, int(y + hh))
            fl.append(luma[y0:y1, x0:x1].mean())
            fs.append(s[y0:y1, x0:x1].mean())
        r["faceLuma"] = round(float(np.mean(fl)), 1)
        r["faceSat"] = round(float(np.mean(fs)), 3)
        r["faceCx"] = round(float(np.mean([(x + w / 2) / W for x, y, w, hh in faces])), 3)
        r["faceCy"] = round(float(np.mean([(y + hh / 2) / H for x, y, w, hh in faces])), 3)
        r["faceH"] = round(float(max(hh / H for x, y, w, hh in faces)), 3)
    out.append(r)
json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out), "장")

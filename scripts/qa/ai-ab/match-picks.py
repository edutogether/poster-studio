# AI 품질 A/B — 사람이 고른 그림(갤러리에서 저장한 webp 등)이 어느 생성 결과(조건 · 갈래)인지 화소로 맞춘다.
#   python -I match-picks.py <고른 그림 폴더> <결과 폴더[;폴더]> <출력 json>
# 둘 다 48×72로 줄여 RGB 평균 절대 차이(0~255)를 잰다 — 같은 그림을 다시 인코딩한 것은 차이가 아주 작고(보통 2 미만),
# 다른 그림은 수십이다. 가장 가까운 것과 두 번째의 차이 비율도 적어 «확실함»을 판단한다(비율 3 이상 · 차이 6 미만 = 확실).
import glob, json, os, re, sys
import numpy as np
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
picks_dir, results_dirs, out_path = sys.argv[1], [d for d in sys.argv[2].split(";") if d], sys.argv[3]
SIZE = (48, 72)


def thumb(p):
    return np.asarray(Image.open(p).convert("RGB").resize(SIZE, Image.LANCZOS), dtype=np.float32)


cands = {}
for d in results_dirs:
    for p in glob.glob(os.path.join(d, "*.png")):
        m = re.match(r"^(.*)-([A-Z])\.png$", os.path.basename(p))
        if m:
            cands[(m.group(1), m.group(2))] = thumb(p)
out = []
for p in sorted(glob.glob(os.path.join(picks_dir, "*.*"))):
    if not p.lower().endswith((".webp", ".png", ".jpg", ".jpeg")):
        continue
    t = thumb(p)
    scored = sorted(((float(np.abs(t - v).mean()), k) for k, v in cands.items()), key=lambda x: x[0])
    (d1, (case1, arm1)), (d2, (case2, arm2)) = scored[0], scored[1]
    out.append({"pick": os.path.basename(p), "caseId": case1, "arm": arm1, "diff": round(d1, 2),
                "second": {"caseId": case2, "arm": arm2, "diff": round(d2, 2)}, "ratio": round(d2 / max(d1, 1e-6), 1),
                "sure": d1 < 6 and d2 / max(d1, 1e-6) >= 3})
json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(out), "장 ·", len(cands), "후보 · 확실", sum(o["sure"] for o in out))

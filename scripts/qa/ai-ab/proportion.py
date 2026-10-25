# AI 품질 A/B — 머리 대 몸 비율(«대두») 측정(QA 전용, 생체 식별 아님 — 얼굴 검출 상자와 사람 실루엣의 크기만 쓴다).
#   <rembg venv python> -I proportion.py <birefnet onnx> <출력 json> <checks.json> <그림 폴더> [<checks.json> <그림 폴더> ...]
# 사람 실루엣: 이 PC에 이미 있는 배경 지우기 모델(birefnet-general)을 onnxruntime으로 직접 돌린다(내려받기 없음, 1024×1024).
# 얼굴마다(검출 상자, check.mjs가 남긴 것):
#   sw   어깨 폭 ÷ 얼굴 폭 — 턱 아래 0.5~0.8 얼굴 높이 띠에서 얼굴 가운데를 지나는 실루엣 폭의 최댓값.
#        단체는 옆 사람 얼굴과의 가운데 선에서 자른다(닿으면 merged = 믿기 어려움). 어린이 자연 비율은 대략 2.2 이상, 작을수록 머리가 크다.
#   hb   얼굴 높이 ÷ 머리 위 ~ 발끝 높이 — 그 얼굴 아래 띠에서 가장 낮은 실루엣 화소까지. 발이 그림 아래 끝에 닿으면 cut(전신 아님 — 쓰지 않음).
#        어린이 자연 비율(머리 : 키 ≈ 1 : 6~6.5, 얼굴 상자 ≈ 머리의 0.75)이면 0.11~0.13, 클수록 머리가 크다.
import json, os, sys
import numpy as np
import onnxruntime as ort
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
model, out_path = sys.argv[1], sys.argv[2]
pairs = list(zip(sys.argv[3::2], sys.argv[4::2]))
sess = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def mask_of(path):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    x = (np.asarray(im.resize((1024, 1024), Image.BILINEAR), dtype=np.float32) / 255 - MEAN) / STD
    y = sess.run(None, {"input_image": x.transpose(2, 0, 1)[None]})[0][0, 0]
    y = 1 / (1 + np.exp(-np.clip(y, -50, 50))) if y.min() < 0 or y.max() > 1 else y
    m = np.asarray(Image.fromarray((y * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)) > 127
    return m, W, H


def run_width(row, cx, lo, hi):
    """row(불리언 한 줄)에서 cx를 지나는 실루엣 구간의 폭 — lo · hi(옆 사람 경계)에서 자른다."""
    if not row[cx]:
        return 0, False
    a = cx
    while a - 1 >= lo and row[a - 1]:
        a -= 1
    b = cx
    while b + 1 <= hi and row[b + 1]:
        b += 1
    merged = (a == lo and lo > 0 and row[lo - 1]) or (b == hi and hi < len(row) - 1 and row[hi + 1])
    return b - a + 1, merged


out = []
for checks_path, img_dir in pairs:
    checks = json.load(open(checks_path, encoding="utf-8"))
    for c in checks:
        p = os.path.join(img_dir, c["file"])
        if not os.path.exists(p):
            continue
        m, W, H = mask_of(p)
        faces = sorted([f for f in (c.get("faces") or []) if f[2] * f[3] >= (W * 0.03) * (H * 0.02)], key=lambda f: f[0] + f[2] / 2)
        rows = []
        for i, (x, y, w, h) in enumerate(faces):
            cx = int(min(W - 1, max(0, x + w / 2)))
            lo = int((faces[i - 1][0] + faces[i - 1][2] / 2 + cx) / 2) if i > 0 else 0
            hi = int((faces[i + 1][0] + faces[i + 1][2] / 2 + cx) / 2) if i + 1 < len(faces) else W - 1
            best, merged = 0, False
            for yy in range(int(y + h * 1.5), int(y + h * 1.8)):
                if 0 <= yy < H:
                    wd, mg = run_width(m[yy], cx, lo, hi)
                    if wd > best:
                        best, merged = wd, mg
            band = m[:, max(0, int(cx - w * 0.5)):min(W, int(cx + w * 0.5))]
            ys = np.where(band[int(y):].any(axis=1))[0]
            bottom = int(y + ys.max()) if ys.size else None
            cut = bottom is None or bottom >= H - 6
            rows.append({"face": [round(float(v)) for v in (x, y, w, h)], "sw": round(best / w, 2) if best else None, "merged": bool(merged),
                         "hb": None if cut else round(h / (bottom - (y - 0.25 * h)), 3), "cut": bool(cut)})
        r = {"caseId": c["caseId"], "arm": c["arm"], "file": c["file"], "faces": rows, "maskShare": round(float(m.mean()), 3)}
        sws = [f["sw"] for f in rows if f["sw"] and not f["merged"]]
        hbs = [f["hb"] for f in rows if f["hb"]]
        r["swMin"] = min(sws) if sws else None
        r["hbMax"] = max(hbs) if hbs else None
        out.append(r)
        print(c["caseId"], c["arm"], "얼굴", len(rows), "어깨/얼굴 최소", r["swMin"], "얼굴/키 최대", r["hbMax"], flush=True)
json.dump(out, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
print(len(out), "장")

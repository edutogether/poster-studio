# 그림자를 "검정 + 투명도"로 표현을 바꾼다 — 흰 배경 위 회색 그림자는 검정을 반투명하게 깐 것과 흰 바탕에서 똑같이 보인다.
#  · 캐릭터(배경 분리 결과 완전 불투명) 화소의 색은 그대로 둔다.
#  · 캐릭터 밖의 회색(낮은 채도) 화소는 밝기만큼 검정의 투명도로 바꾼다: 투명도 = 1 - 밝기/배경흰색.
#  · 아주 옅은 차이(배경 잡티)는 0으로 둔다.
# 사용: python shadowize.py <원본 RGB 폴더 또는 파일들> <배경분리 RGBA 폴더> <출력 폴더>
import glob, os, sys
import numpy as np
from PIL import Image

NOISE = 0.012          # 이보다 옅은 회색은 그림자로 보지 않는다(배경 잡티)
GRAY_SAT = 28          # 채도가 이보다 높으면 그림자가 아니라 캐릭터 일부로 보고 건드리지 않는다


def _grow(seed, allowed):
    m = seed & allowed
    while True:
        n = m.copy(); n[1:] |= m[:-1]; n[:-1] |= m[1:]; n[:, 1:] |= m[:, :-1]; n[:, :-1] |= m[:, 1:]; n &= allowed
        if (n == m).all(): return m
        m = n


RESTORE_SAT = 22   # 배경과 이어진 흰색·회색이 아니면서 이만큼 색이 있으면 그림의 일부(흙·새싹 등)로 본다


def refine_alpha(rgb, alpha):
    """AI 배경 분리가 그림 요소(색이 있는 부분)를 배경으로 지운 곳을 되살린다. 회색 그림자는 건드리지 않는다."""
    v = rgb.max(2).astype(int); sat = v - rgb.min(2).astype(int)
    border = np.zeros(v.shape, bool); border[0] = border[-1] = border[:, 0] = border[:, -1] = True
    bg = _grow(border, (v >= 247) & (sat <= 8))
    restore = ~bg & (sat >= RESTORE_SAT) & (alpha < 128)
    out = alpha.copy(); out[restore] = 255
    return out, int(restore.sum())


def shadowize(rgb, alpha):
    rgb = rgb.astype(np.float64); a = alpha.astype(np.float64) / 255.0
    bgmask = (a < 0.02) & (rgb.min(2) > 240)
    W = np.median(rgb[bgmask].mean(1)) if bgmask.any() else 255.0     # 이 그림의 배경 흰색 값
    L = rgb.mean(2); sat = rgb.max(2) - rgb.min(2)
    s = np.clip(1 - L / W, 0, 1)
    s = np.clip((s - NOISE) / (1 - NOISE), 0, 1)
    s[(sat > GRAY_SAT) | (a >= 0.999)] = 0
    out_a = a + s * (1 - a)
    with np.errstate(invalid='ignore', divide='ignore'):
        out_rgb = np.where(out_a[..., None] > 0, (a[..., None] * rgb) / out_a[..., None], rgb)
    out_rgb[a >= 0.999] = rgb[a >= 0.999]          # 캐릭터 화소는 원래 색 그대로
    return np.clip(out_rgb.round(), 0, 255).astype(np.uint8), np.clip((out_a * 255).round(), 0, 255).astype(np.uint8), W


def on_white(rgb, a, W):
    a = a.astype(np.float64)[..., None] / 255.0
    return rgb.astype(np.float64) * a + (1 - a) * W


if __name__ == '__main__':
    SRC, MATTE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(OUT, exist_ok=True)
    srcs = sorted(glob.glob(os.path.join(SRC, '*.png')) + glob.glob(os.path.join(SRC, '*.webp')))
    diffs = []
    for sp in srcs:
        base = os.path.splitext(os.path.basename(sp))[0]
        mp = os.path.join(MATTE, base + '.png')
        if not os.path.exists(mp): continue
        rgb = np.asarray(Image.open(sp).convert('RGB').resize(Image.open(mp).size, Image.LANCZOS))
        alpha = np.asarray(Image.open(mp))[..., 3]
        alpha, restored = refine_alpha(rgb, alpha)
        o_rgb, o_a, W = shadowize(rgb, alpha)
        Image.fromarray(np.dstack([o_rgb, o_a]), 'RGBA').save(os.path.join(OUT, base + '.png'))
        back = on_white(o_rgb, o_a, W)
        d = np.abs(back - rgb.astype(np.float64))
        diffs.append((base, float(d.mean()), float(np.percentile(d, 99.9)), restored, int(((o_a > 0) & (alpha == 0)).sum())))
    for b, m, p, rs, sh in diffs:
        print(f'{b}: 흰 바탕 재합성 차이 평균 {m:.2f} · 상위 0.1% {p:.1f} (0~255) · 되살린 화소 {rs} · 그림자로 바뀐 화소 {sh}')

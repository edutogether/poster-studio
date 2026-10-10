# 누끼 다듬기 — AI 마스크를 "확실한 안 / 확실한 밖 / 경계 띠"로 나눈 뒤(트라이맵),
# 경계 띠의 투명도만 다시 푼다(closed-form matting, PyMatting). 그다음 흰 배경을 수식으로 걷어낸다.
#  · 경계 화소의 색 C = α·F + (1−α)·B  →  F = B + (C − B)/α  (B = 바로 옆 배경색, 보통 흰색·그림자 진 곳은 회색)
#    지금 처리에서 흰 테두리가 남는 이유가 바로 이 배경 섞임을 안 걷어낸 것이다.
#  · 바깥 흰 배경과 이어진 흰 화소와, 그림 안에 갇힌 흰 틈(팔과 포스터 사이 등)은 확실한 밖으로 둔다.
#  · 완전히 밖인 회색 화소는 그림자로 보고 "검정 + 투명도"로 바꾼다(shadowize와 같은 식).
# 사용: python refine_matte.py <원본 RGB> <AI 마스크 RGBA> <출력 RGBA> [그림자 진하기 배율]
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from pymatting import estimate_alpha_cf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shadowize import NOISE, RESTORE_SAT, _grow

BAND = 3          # AI 경계에서 안팎으로 이만큼(화소)을 "모르는 곳"으로 둔다
GAP_MIN = 25      # 그림 안에 갇힌 흰 틈을 배경으로 볼 최소 크기(화소) — 눈 반사광 같은 작은 흰 점은 건드리지 않는다
FLOOR = 0.02      # 이보다 옅은 투명도는 0으로 본다
WEAK = 0.15       # 이보다 옅으면 F 수식이 불안정해 가장 가까운 확실한 화소의 색을 빌린다
RESTORE_MIN = 150 # 이보다 작은 색 덩어리는 되살리지 않는다(경계 잔여일 가능성이 크다)
FEATHER = 0.8   # 경계 띠 안에서만 쓰는 부드럽게 하기 폭(가우시안 시그마, 화소)
SHADE_S = 0.3   # 밝기 대비 색 기운(HSV 채도). 이보다 낮으면 그림자, 높으면 그림 — 빨간 신발빛이 비친 접지 그림자는 0.13~0.25,
                # 새싹·흙 같은 그림은 0.5 이상이다. 예전엔 밝기 차이(22·28)로 갈라서 비친 그림자를 그림으로 되살려 밑창 밑에 갈색 띠가 남았다
DARK_SHADE = 120   # 이보다 어두운 바깥 화소는 색 기운과 상관없이 그림자(밑창 바로 밑 접지선) — 어두우면 채도 계산이 과장된다
SHADOW_CAP = 0.85  # 그림자 진하기를 올려도 이보다 진해지지 않게(검은 덩어리 방지)


def hsv_s(rgb):
    v = rgb.max(2).astype(np.float64); return (v - rgb.min(2)) / np.maximum(v, 1)


def restore_mask(rgb, ai_a):
    """AI가 덩어리째 지운 색 있는 그림(새싹·흙 등)만 찾는다.
    예전 규칙(refine_alpha)은 경계의 반투명 화소까지 완전 불투명으로 되살려 가장자리를 계단처럼 만들었다 —
    그래서 가는 띠는 깎아 내고(열림 연산), 일정 크기 이상 덩어리만 되살린다."""
    v = rgb.max(2).astype(int); sat = v - rgb.min(2).astype(int)
    cand = (sat >= RESTORE_SAT) & (ai_a < 128)
    cand = ndi.binary_opening(cand, iterations=2)
    lab, n = ndi.label(cand)
    if not n: return cand
    idx = range(1, n + 1)
    sizes = ndi.sum(np.ones(lab.shape), lab, idx)
    # 덩어리 «평균» 채도로 가른다: 잎의 밝은 반사광처럼 화소 하나는 옅어도 덩어리 전체가 진하면 그림이고,
    # 신발빛이 비친 접지 그림자 띠는 덩어리 전체가 옅다(0.2 안팎) — 화소마다 가르면 잎에 구멍이 났다
    mean_s = ndi.mean(hsv_s(rgb), lab, idx)
    keep = 1 + np.flatnonzero((sizes >= RESTORE_MIN) & (mean_s >= SHADE_S))
    return np.isin(lab, keep)


def trimap(rgb, ai_a):
    v = rgb.max(2).astype(int); sat = v - rgb.min(2).astype(int)
    whiteish = (v >= 246) & (sat <= 8)
    border = np.zeros(v.shape, bool); border[0] = border[-1] = border[:, 0] = border[:, -1] = True
    outside = _grow(border, whiteish)
    lab, n = ndi.label(whiteish & ~outside & (ai_a < 128))
    sizes = ndi.sum(np.ones(lab.shape), lab, range(1, n + 1)) if n else np.array([])
    gaps = np.isin(lab, 1 + np.flatnonzero(sizes >= GAP_MIN))
    # AI가 밖으로 본 회색 화소는 그림자다 — 경계 띠에 넣으면 수식이 "아주 진한 반투명 그림"으로 풀어 신발 밑에 검은 줄이 생긴다
    shadow = (ai_a < 128) & ((hsv_s(rgb) < SHADE_S) | (v < DARK_SHADE)) & (v < 246)
    fg = ndi.binary_erosion(ai_a >= 128, iterations=BAND)
    bg = (ndi.binary_erosion(ai_a < 128, iterations=BAND) | outside | gaps | shadow) & ~fg
    t = np.full(v.shape, 0.5); t[fg] = 1.0; t[bg] = 0.0
    return t


def unmix_local(C, a, s):
    """경계 화소에서 바로 옆 배경(그림자가 진 흰색일 수도 있다)의 섞임을 걷어낸다.
    관측색 C = α·F + (1−α)·B  (B = 가장 가까운 완전 배경 화소의 색)  →  F = B + (C − B)/α
    그리고 그 배경에 진 그림자(s)를 경계 화소에도 이어 붙인다: 투명도 α + s(1−α), 색 α·F / 그 투명도."""
    _, (by, bx) = ndi.distance_transform_edt(a > 0, return_indices=True)
    B = C[by, bx]; sB = s[by, bx]
    F = np.clip(B + (C - B) / np.maximum(a, 1e-3)[..., None], 0, 255)
    weak = (a > 0) & (a < WEAK)
    if weak.any():   # 너무 옅으면 나눗셈이 불안정하다 → 가장 가까운 확실한 화소의 색을 빌린다
        _, (iy, ix) = ndi.distance_transform_edt(a < 0.6, return_indices=True)
        F[weak] = F[iy[weak], ix[weak]]
    full = a >= 0.999
    F[full] = C[full]
    out_a = np.where(a > 0, a + sB * (1 - a), s)
    with np.errstate(invalid='ignore', divide='ignore'):
        out_rgb = np.where((a > 0)[..., None], a[..., None] * F / np.maximum(out_a, 1e-6)[..., None], 0.0)
    out_rgb[full] = C[full]
    return out_rgb, out_a


def refine(rgb, ai_a, shadow_gain=1.0):
    """shadow_gain: 그림자 진하기 배율. 모양·위치는 그대로 두고 투명도만 곱한다(최대 SHADOW_CAP)."""
    restored = restore_mask(rgb, ai_a)
    ai_a = np.where(restored, 255, ai_a).astype(np.uint8)     # 되살릴 덩어리는 AI가 그림으로 본 것처럼 다룬다(경계는 아래 수식이 푼다)
    t = trimap(rgb, ai_a)
    a = np.clip(estimate_alpha_cf(rgb.astype(np.float64) / 255.0, t), 0, 1)
    # 흰 몸통·흰 종이처럼 배경과 색이 같은 곳은 수식도 경계를 못 찾아 계단처럼 딱 끊긴다 → 경계 띠 안에서만 살짝 부드럽게 한다
    band = t == 0.5
    a[band] = ndi.gaussian_filter(a, FEATHER)[band]
    a[a < FLOOR] = 0
    a = (a * 255).round() / 255.0
    bgmask = (t == 0) & (rgb.min(2) > 240)
    W = float(np.median(rgb[bgmask].mean(1))) if bgmask.any() else 255.0
    C = rgb.astype(np.float64); L = C.mean(2)
    s = np.clip((np.clip(1 - L / W, 0, 1) - NOISE) / (1 - NOISE), 0, 1)   # 완전 배경 화소의 그림자 세기
    s[((hsv_s(rgb) >= SHADE_S) & (rgb.max(2) >= DARK_SHADE)) | (a > 0)] = 0
    if shadow_gain != 1.0: s = np.minimum(s * shadow_gain, np.maximum(s, SHADOW_CAP))
    out_rgb, out_a = unmix_local(C, a, s)
    return np.clip(out_rgb.round(), 0, 255).astype(np.uint8), np.clip((out_a * 255).round(), 0, 255).astype(np.uint8), W, int(restored.sum())


if __name__ == '__main__':
    SRC, MATTE, OUT = sys.argv[1:4]; GAIN = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
    rgb = np.asarray(Image.open(SRC).convert('RGB'))
    ai_a = np.asarray(Image.open(MATTE).convert('RGBA'))[..., 3]
    o_rgb, o_a, W, restored = refine(rgb, ai_a, GAIN)
    Image.fromarray(np.dstack([o_rgb, o_a]), 'RGBA').save(OUT)
    back = o_rgb.astype(np.float64) * (o_a[..., None] / 255.0) + (1 - o_a[..., None] / 255.0) * W
    print(f'{OUT}: 흰 바탕 재합성 차이 평균 {np.abs(back - rgb).mean():.2f} · 되살린 화소 {restored}')

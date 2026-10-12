"""한 사람의 얼굴을 다른 장면의 같은 사람 얼굴로 «옮겨 붙인다» — 크기·각도는 눈 두 점과 입 한 점으로 맞추고(닮은꼴 변환),
색·밝기는 받는 장면의 얼굴에 맞춘 뒤, 부드러운 타원 가면 안만 바꾼다. 가면 밖 화소는 받는 장면과 0 차이(2026-10-13 팀장 지시:
«v8 B 얼굴을 v9 장의 B 얼굴 자리에 크기·각도 맞춰 옮겨 붙이고, 얼굴 밖 0»).

점은 원본 화소 좌표 «왼눈x,왼눈y,오른눈x,오른눈y,입x,입y»(그림에서 보이는 왼쪽·오른쪽). 가면 타원은 받는 장면의 점으로 정한다:
가운데 = 두 눈 가운데와 입의 중간, 가로 반지름 = 눈 사이 거리 × WIDE, 세로 반지름 = (눈 가운데~입 거리) × TALL.

사용: python scripts/media/face-transplant.py <주는 장면.png> <주는 점> <받는 장면.png> <받는 점> <출력.png> [--wide 1.05] [--tall 1.55] [--feather 9]
종료: 0 · 1 가면 밖 화소가 바뀜 · 2 입력 오류
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def pts(s):
    v = [float(x) for x in s.split(',')]
    if len(v) != 6: raise SystemExit('점은 6개 숫자(왼눈x,y,오른눈x,y,입x,y)')
    return np.array(v).reshape(3, 2)


def main(argv):
    a = list(argv); opt = {'--wide': 1.05, '--tall': 1.55, '--feather': 9.0}
    keeps = []                                   # --keep x0,y0,x1,y1: 이 상자는 받는 장면 그대로(얼굴 가까이 있는 손 등)
    while '--keep' in a:
        i = a.index('--keep'); keeps.append([int(v) for v in a[i + 1].split(',')]); del a[i:i + 2]
    for k in list(opt):
        if k in a:
            i = a.index(k); opt[k] = float(a[i + 1]); del a[i:i + 2]
    if len(a) != 5: print(__doc__); return 2
    src_p, sp, dst_p, dp, out_p = a
    P, Q = pts(sp), pts(dp)                      # 주는 점, 받는 점
    S = np.asarray(Image.open(src_p).convert('RGB')).astype(np.float32)
    D = np.asarray(Image.open(dst_p).convert('RGB')).astype(np.float32)
    H, W, _ = D.shape
    # 받는 좌표 → 주는 좌표 닮은꼴 변환(복소수 최소제곱: p = a*q + b)
    q = Q[:, 0] + 1j * Q[:, 1]; p = P[:, 0] + 1j * P[:, 1]
    A = np.stack([q, np.ones(3)], 1); coef = np.linalg.lstsq(A, p, rcond=None)[0]
    resid = np.abs(A @ coef - p).max()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    z = coef[0] * (xx + 1j * yy) + coef[1]
    u, v = z.real.astype(np.float32), z.imag.astype(np.float32)
    warped = np.stack([ndi.map_coordinates(S[..., c], [v, u], order=1, mode='nearest') for c in range(3)], -1)
    # 가면
    eyes = (Q[0] + Q[1]) / 2; c = (eyes + Q[2]) / 2
    ed = np.linalg.norm(Q[1] - Q[0]); em = np.linalg.norm(Q[2] - eyes)
    ang = np.arctan2(Q[1][1] - Q[0][1], Q[1][0] - Q[0][0])
    rx, ry = ed * opt['--wide'], em * opt['--tall']
    dx, dy = xx - c[0], yy - c[1]
    lx = dx * np.cos(ang) + dy * np.sin(ang); ly = -dx * np.sin(ang) + dy * np.cos(ang)
    r = np.sqrt((lx / rx) ** 2 + (ly / ry) ** 2)
    inner = r <= 1.0
    # 색 맞춤: 가면 안쪽 70% 영역의 채널별 평균·표준편차를 받는 장면에 맞춘다
    core = r <= 0.7
    for ch in range(3):
        ms, ss = warped[core, ch].mean(), warped[core, ch].std() + 1e-6
        md, sd = D[core, ch].mean(), D[core, ch].std() + 1e-6
        warped[..., ch] = (warped[..., ch] - ms) * (0.5 + 0.5 * sd / ss) + md
    alpha = ndi.gaussian_filter(inner.astype(np.float32), opt['--feather'] / 2.5)
    alpha[r > 1.0 + 3 * opt['--feather'] / min(rx, ry)] = 0
    if keeps:
        k = np.zeros((H, W), np.float32)
        for x0, y0, x1, y1 in keeps: k[y0:y1, x0:x1] = 1
        k = np.clip(ndi.gaussian_filter(k, 3) * 2, 0, 1)
        alpha = alpha * (1 - k); alpha[alpha < 1e-3] = 0
    out = D * (1 - alpha[..., None]) + warped * alpha[..., None]
    O = np.clip(out.round(), 0, 255).astype(np.uint8)
    Image.fromarray(O).save(out_p)
    bad = int(np.any(O[alpha == 0] != D.astype(np.uint8)[alpha == 0], axis=1).sum())
    print(f'저장 {out_p} · 배율 {abs(coef[0]):.3f}(받는→주는) 회전 {np.degrees(np.angle(coef[0])):.1f}° 점 어긋남 최대 {resid:.1f}px · '
          f'가면 가운데 ({c[0]:.0f},{c[1]:.0f}) 반지름 {rx:.0f}×{ry:.0f} · 가면 밖 바뀐 화소 {bad}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

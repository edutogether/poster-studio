"""한 사람의 얼굴을 다른 장면의 같은 사람 얼굴로 «옮겨 붙인다» — 크기·각도는 눈 두 점과 입 한 점으로 맞추고(닮은꼴 변환),
색·밝기는 받는 장면의 얼굴에 맞춘 뒤, 부드러운 타원 가면 안만 바꾼다. 가면 밖 화소는 받는 장면과 0 차이(2026-10-13 팀장 지시:
«v8 B 얼굴을 v9 장의 B 얼굴 자리에 크기·각도 맞춰 옮겨 붙이고, 얼굴 밖 0»).

점은 원본 화소 좌표 «왼눈x,왼눈y,오른눈x,오른눈y,입x,입y»(그림에서 보이는 왼쪽·오른쪽). 가면 타원은 받는 장면의 점으로 정한다:
가운데 = 두 눈 가운데와 입의 중간, 가로 반지름 = 눈 사이 거리 × WIDE, 세로 반지름 = (눈 가운데~입 거리) × TALL.

사용: python scripts/media/face-transplant.py <주는 장면.png> <주는 점> <받는 장면.png> <받는 점> <출력.png> [--wide 1.05] [--tall 1.55] [--feather 9]
      [--keep x0,y0,x1,y1] [--keep-poly x,y,x,y,...] [--axis] [--matte | --matte-dst] [--scale S]
--scale S: 주는 얼굴을 받는 장면에서 S배 크기로(눈 점으로 맞춘 크기 대신). 자리·기울기는 받는 눈 가운데·눈 선을 따른다. 받는 장면의
           얼굴이 몸에 비해 작게 그려진 경우, 몸(어깨) 폭에서 정한 크기로 키워 붙인다(2026-10-13 단체 B). 가면도 같은 비율로 커진다.
--matte: 두 장 모두 사람 영역(BiRefNet 로컬 모델, clean-plate-composite.py와 같은 것)인 곳만 옮긴다. 큰 가면이 주는 장면의 배경을
         끌어와 얼굴 둘레가 번지는 것을 막는다(2026-10-13 단체 B K1 — v8 로비 불빛이 얼굴 왼쪽에 번져 들어왔다).
--matte-dst: 받는 장면이 사람인 곳만 바꾼다(주는 쪽은 따지지 않음). 받는 얼굴이 주는 얼굴보다 넓을 때 --matte는 받는 볼을
         그대로 남겨 볼이 두 겹이 됐다(K4 오른쪽 턱) — 이때는 받는 볼 자리를 주는 장면 화소(턱 옆 배경)로 덮는다.
--axis: 크기·각도·자리를 «두 눈 가운데 → 입» 축 하나로만 맞춘다(눈 사이 거리는 따르지 않는다). 받는 장면의 눈이 옆으로 길고 얼굴이 넓게
        그려진 경우, 세 점을 다 맞추면 그 넓은 비율이 그대로 옮겨 온다(2026-10-13 개인 K0·K4).
--keep-poly: 이 다각형 안은 받는 장면 그대로(볼에 닿은 손가락처럼 상자로 못 가르는 것).
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
    polys = []
    while '--keep-poly' in a:
        i = a.index('--keep-poly'); v = [float(t) for t in a[i + 1].split(',')]; polys.append(list(zip(v[0::2], v[1::2]))); del a[i:i + 2]
    axis = '--axis' in a
    if axis: a.remove('--axis')
    matte = '--matte' in a
    if matte: a.remove('--matte')
    mdst = '--matte-dst' in a
    if mdst: a.remove('--matte-dst')
    force = None
    if '--scale' in a:
        i = a.index('--scale'); force = float(a[i + 1]); del a[i:i + 2]
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
    if axis:                                     # 눈 가운데·입 두 점만(정확히 맞는 닮은꼴)
        q = np.array([(q[0] + q[1]) / 2, q[2]]); p = np.array([(p[0] + p[1]) / 2, p[2]])
    A = np.stack([q, np.ones(len(q))], 1); coef = np.linalg.lstsq(A, p, rcond=None)[0]
    grow = 1.0
    if force:                                    # 크기만 바꾼다: 받는 눈 가운데를 고정점으로, 받는→주는 배율 = 1/S
        qe = (Q[0, 0] + Q[1, 0]) / 2 + 1j * (Q[0, 1] + Q[1, 1]) / 2; pe = (P[0, 0] + P[1, 0]) / 2 + 1j * (P[0, 1] + P[1, 1]) / 2
        a0 = coef[0] / abs(coef[0]) / force
        grow = abs(coef[0]) * force
        coef = np.array([a0, pe - a0 * qe])
    resid = np.abs(A @ coef - p).max()
    Pe = P[:2, 0] + 1j * P[:2, 1]; Qe = Q[:2, 0] + 1j * Q[:2, 1]
    eye_off = np.abs((Pe - coef[1]) / coef[0] - Qe).max()    # 주는 눈이 받는 장면에서 놓이는 자리와 받는 눈의 차이(--axis면 0이 아니다)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    z = coef[0] * (xx + 1j * yy) + coef[1]
    u, v = z.real.astype(np.float32), z.imag.astype(np.float32)
    warped = np.stack([ndi.map_coordinates(S[..., c], [v, u], order=1, mode='nearest') for c in range(3)], -1)
    # 가면
    eyes = (Q[0] + Q[1]) / 2; c = (eyes + Q[2]) / 2
    ed = np.linalg.norm(Q[1] - Q[0]); em = np.linalg.norm(Q[2] - eyes)
    ang = np.arctan2(Q[1][1] - Q[0][1], Q[1][0] - Q[0][0])
    rx, ry = ed * opt['--wide'] * grow, em * opt['--tall'] * grow
    c = eyes + (c - eyes) * grow                 # 가면 가운데도 눈 가운데에서 같은 비율로
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
    if matte or mdst:
        import os
        os.environ['U2NET_HOME'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'tools', 'rembg-models')
        from rembg import new_session, remove
        sess = new_session('birefnet-general')
        da = np.asarray(remove(Image.open(dst_p).convert('RGB'), session=sess, only_mask=True).convert('L'), np.float32) / 255
        if matte:
            sa = np.asarray(remove(Image.open(src_p).convert('RGB'), session=sess, only_mask=True).convert('L'), np.float32) / 255
            sa = ndi.map_coordinates(sa, [v, u], order=1, mode='nearest')
            alpha = alpha * np.minimum(da, sa)
        else:
            alpha = alpha * da
        alpha[alpha < 1e-3] = 0
    if keeps or polys:
        k = np.zeros((H, W), np.float32)
        for x0, y0, x1, y1 in keeps: k[y0:y1, x0:x1] = 1
        if polys:
            from PIL import ImageDraw
            km = Image.new('L', (W, H), 0)
            for poly in polys: ImageDraw.Draw(km).polygon(poly, fill=255)
            k = np.maximum(k, np.asarray(km, np.float32) / 255)
        k = np.clip(ndi.gaussian_filter(k, 3) * 2, 0, 1)
        alpha = alpha * (1 - k); alpha[alpha < 1e-3] = 0
    out = D * (1 - alpha[..., None]) + warped * alpha[..., None]
    O = np.clip(out.round(), 0, 255).astype(np.uint8)
    Image.fromarray(O).save(out_p)
    bad = int(np.any(O[alpha == 0] != D.astype(np.uint8)[alpha == 0], axis=1).sum())
    print(f'저장 {out_p} · 배율 {abs(coef[0]):.3f}(받는→주는) 회전 {np.degrees(np.angle(coef[0])):.1f}° 점 어긋남 최대 {resid:.1f}px · 눈 자리 차이 최대 {eye_off:.1f}px · '
          f'가면 가운데 ({c[0]:.0f},{c[1]:.0f}) 반지름 {rx:.0f}×{ry:.0f} · 가면 밖 바뀐 화소 {bad}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

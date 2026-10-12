"""한 사람의 얼굴만 다른 판(편집본)에서 가져와 원본에 얹는다 — 얼굴 영역 밖 화소는 원본과 0 차이(2026-10-13 팀장 지시, Bumm님:
«B 얼굴만 되살리고 그 밖의 모든 화소는 그대로»).

순서
1. 편집본을 원본 크기로 맞추고, 얼굴 둘레(타원 바깥 고리)에서 원본과의 차이가 가장 작은 배율·이동을 찾아 맞춘다
   (이미지 편집 모델이 그림을 조금 밀거나 키우는 경우가 있다).
2. 부드러운 타원 가면(가장자리 FEATHER 화소)으로 얼굴 안쪽만 편집본 화소, 바깥은 원본 화소 그대로.
3. 가면이 0인 곳에서 결과가 원본과 화소 하나도 다르지 않은지 확인한다.

사용: python scripts/media/face-patch.py <원본.png> <편집본.png> <출력.png> <cx,cy,rx,ry 원본 화소> [--feather 10]
종료: 0 · 1 바깥 화소가 원본과 다름(있으면 안 됨) · 2 입력 오류
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def main(argv):
    args = list(argv); feather = 10
    if '--feather' in args:
        i = args.index('--feather'); feather = int(args[i + 1]); del args[i:i + 2]
    if len(args) != 4: print(__doc__); return 2
    src_p, ed_p, out_p, ell = args
    cx, cy, rx, ry = (float(v) for v in ell.split(','))
    S = np.asarray(Image.open(src_p).convert('RGB')).astype(np.float32)
    H, W, _ = S.shape
    Eim = Image.open(ed_p).convert('RGB').resize((W, H), Image.LANCZOS)
    E0 = np.asarray(Eim).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    ring = (r > 1.15) & (r < 1.8)                                   # 맞춤은 얼굴 바깥 고리(머리·배경)로
    best = None
    for sc in np.arange(0.985, 1.0151, 0.005):
        for dy in range(-8, 9, 2):
            for dx in range(-8, 9, 2):
                # 출력 좌표 → 편집본 좌표: 얼굴 가운데 기준 확대 + 이동
                u = (xx - cx) * sc + cx + dx; v = (yy - cy) * sc + cy + dy
                m = ring
                samp = np.stack([ndi.map_coordinates(E0[..., c], [v[m], u[m]], order=1, mode='nearest') for c in range(3)], -1)
                err = float(np.abs(samp - S[m]).mean())
                if best is None or err < best[0]: best = (err, sc, dx, dy)
    err, sc, dx, dy = best
    u = (xx - cx) * sc + cx + dx; v = (yy - cy) * sc + cy + dy
    E = np.stack([ndi.map_coordinates(E0[..., c], [v, u], order=1, mode='nearest') for c in range(3)], -1)
    inner = r <= 1.0
    a = ndi.gaussian_filter(inner.astype(np.float32), feather / 2.5)
    a[r > 1.0 + 3 * feather / min(rx, ry)] = 0                       # 가면 꼬리는 잘라 바깥은 정확히 0
    out = S * (1 - a[..., None]) + E * a[..., None]
    O = np.clip(out.round(), 0, 255).astype(np.uint8)
    Image.fromarray(O).save(out_p)
    outside = a == 0
    bad = int(np.any(O[outside] != S.astype(np.uint8)[outside], axis=1).sum())
    inner_change = float(np.abs(O[inner].astype(np.float32) - S[inner]).mean())
    print(f'저장 {out_p} · 맞춤 배율 {sc:.3f} 이동 ({dx},{dy}) 고리 차이 {err:.1f} · 얼굴 안 평균 변화 {inner_change:.1f} · 가면 밖 바뀐 화소 {bad}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

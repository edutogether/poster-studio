"""한 사람의 머리(번·안경·머리카락 포함)를 몸에 비해 더 크게 — 머리 안은 정한 배율로 키우고, 둘레로 갈수록 배율이 1로 부드럽게
돌아오는 «부풀리기» 변형(2026-10-13 팀장 지시, Bumm님: «B 얼굴 크기가 장마다 몸 비율에 비해 너무 작았다 정상으로 돌아왔다 —
머리(번 포함)·어깨 너비에 대한 얼굴 크기 비율을 v8 기준으로 고정»).

왜 오려 붙이지 않고 변형하나: 머리만 오려 키워 얹으면 목 둘레에 옛 목과 새 목이 겹쳐 두 겹 테두리가 생긴다. 변형은 화소를
끊지 않고 밀어내므로 목·머리카락 끝·얼굴에 닿은 손이 이어진 채 함께 움직인다.

기준점(ox,oy)을 중심으로 키운다 — 턱 바로 아래를 주면 목 길이는 그대로 두고 머리가 위·옆으로 커진다.
배율 가중치: 머리 타원(cx,cy,rx,ry, 기울기 deg) 안은 1, 타원 밖 FALLOFF 화소에 걸쳐 0으로(부드러운 계단). 가중치 0인 곳은 화소 0 차이.
--keep-poly x,y,...: 이 다각형 안은 원래 그림 그대로(바로 옆 사람 등).
--matte: 사람 영역(BiRefNet 로컬 모델)만 키우고 배경은 원래 그대로 둔다 — 배경까지 밀면 머리 둘레의 로비 천장 띠가 물결처럼
         휘었다(2026-10-13 K4 첫 시도). 키운 머리가 옛 머리를 덮으므로 옛 머리는 남지 않는다.

사용: python scripts/media/head-bloat.py <입력.png> <출력.png> <배율> <ox,oy> <cx,cy,rx,ry[,deg]> [--falloff 40] [--keep-poly ...] [--matte]
종료: 0 · 1 가중치 0인 곳의 화소가 바뀜 · 2 입력 오류
"""
import sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def main(argv):
    a = list(argv); falloff = 40.0; polys = []
    matte = '--matte' in a
    if matte: a.remove('--matte')
    if '--falloff' in a:
        i = a.index('--falloff'); falloff = float(a[i + 1]); del a[i:i + 2]
    while '--keep-poly' in a:
        i = a.index('--keep-poly'); v = [float(t) for t in a[i + 1].split(',')]; polys.append(list(zip(v[0::2], v[1::2]))); del a[i:i + 2]
    if len(a) != 5: print(__doc__); return 2
    src_p, out_p, s, o, e = a
    s = float(s); ox, oy = (float(v) for v in o.split(','))
    ev = [float(v) for v in e.split(',')]
    cx, cy, rx, ry = ev[:4]; ang = np.radians(ev[4] if len(ev) > 4 else 0.0)
    I = np.asarray(Image.open(src_p).convert('RGB')).astype(np.float32)
    H, W, _ = I.shape
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    dx, dy = xx - cx, yy - cy
    lx = dx * np.cos(ang) + dy * np.sin(ang); ly = -dx * np.sin(ang) + dy * np.cos(ang)
    r = np.sqrt((lx / rx) ** 2 + (ly / ry) ** 2)
    dist = (r - 1) * min(rx, ry)                                   # 타원 밖으로 대략 몇 화소
    t = np.clip(dist / falloff, 0, 1)
    w = np.where(r <= 1, 1.0, 1 - (3 * t ** 2 - 2 * t ** 3))      # 부드러운 계단(smoothstep)
    if polys:
        k = Image.new('L', (W, H), 0)
        for poly in polys: ImageDraw.Draw(k).polygon(poly, fill=255)
        k = ndi.gaussian_filter(np.asarray(k, np.float32) / 255, 2)
        w = w * (1 - np.clip(k * 1.5, 0, 1))
    m = 1 + (s - 1) * w
    sx, sy = ox + (xx - ox) / m, oy + (yy - oy) / m                # 출력 화소 → 입력 화소
    O = np.stack([ndi.map_coordinates(I[..., c], [sy, sx], order=3, mode='nearest') for c in range(3)], -1)
    if matte:
        import os
        os.environ['U2NET_HOME'] = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'tools', 'rembg-models')
        from rembg import new_session, remove
        al = np.asarray(remove(Image.open(src_p).convert('RGB'), session=new_session('birefnet-general'), only_mask=True).convert('L'), np.float32) / 255
        aw = ndi.map_coordinates(al, [sy, sx], order=1, mode='nearest')          # 키운 사람 영역
        aw = np.maximum(aw, al * (m > 1.0005))                                      # 옛 머리 자리도 키운 그림으로(키운 머리가 덮는다)
        O = aw[..., None] * O + (1 - aw[..., None]) * I
    O = np.where((w > 0)[..., None], O, I)
    R = np.clip(O.round(), 0, 255).astype(np.uint8)
    Image.fromarray(R).save(out_p)
    bad = int(np.any(R[w == 0] != I.astype(np.uint8)[w == 0], axis=1).sum())
    ch = np.any(R != I.astype(np.uint8), axis=2); ys, xs = np.where(ch)
    print(f'저장 {out_p} · 배율 {s:.3f} 기준점 ({ox:.0f},{oy:.0f}) · 바뀐 범위 x {xs.min()}~{xs.max()} y {ys.min()}~{ys.max()} '
          f'· 가중치 0인 곳 바뀐 화소 {bad}')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

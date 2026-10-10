"""Poster Studio 대기 영상에서 움직이지 않는 소품의 한 자리를 앞뒤의 제대로 된 프레임 화소로 되살린다(2026-10-08, 계획 B).

왜: 카메라가 고정이고 판·탁자 같은 소품은 움직이지 않는데도, 생성 영상에서 그 일부가 잠깐 사라졌다 돌아왔다(12번 2차:
오른쪽 아래 하트 조각이 6~113번 동안 비어 있는 칸으로 바뀌었다가 114번에 돌아옴). 그 자리는 처음과 끝이 같은 그림이어야 하므로
사라지기 직전 프레임(A)과 돌아온 프레임(B)의 화소를 시간에 따라 섞어(A→B) 그 사이 프레임에 얹는다 — 앞뒤와 이어져 튀지 않는다.
A·B에 그 자리를 가린 것이 있으면(12번: 첫 장면에서 로봇이 든 조각이 칸 위를 가림) 가린 것까지 옮겨 붙으므로, 그때는 --ref로 그 자리가
온전히 보이는 프레임 하나를 기준으로 쓴다.
로봇·든 조각처럼 그 자리 앞을 지나가는 것은 지우면 안 되므로, «사라진 자리의 색»(--empty)과 색 비율이 같은(허용 오차 --tol, 비율 기준)
화소만 바꾼다. 밝기는 따지지 않고, 그 자리보다 어두우면 그만큼 기준 화소도 어둡게 얹는다 — 든 조각의 그림자가 빈칸에 지면
그림자를 빼고 바꿔 그 모양대로 어두운 띠가 남았다(12번 60번 실측). 그림자는 되살린 조각 위에 그대로 진다.
사용: python scripts/media/restore-static-region.py <프레임 폴더> <출력 폴더> --box x0,y0,x1,y1 --from A --to B --empty r,g,b [--ref R] [--tol 0.03] [--compare 폴더]
  A·B는 1부터 세는 프레임 번호이고, A+1~B-1번 프레임만 바꾼다. 나머지는 그대로 복사한다.
"""
import argparse, glob, os, shutil, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--box', required=True); ap.add_argument('--from', dest='a', type=int, required=True); ap.add_argument('--to', dest='b', type=int, required=True)
    ap.add_argument('--empty', required=True); ap.add_argument('--tol', type=float, default=0.03); ap.add_argument('--compare'); ap.add_argument('--ref', type=int)
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    x0, y0, x1, y1 = map(int, a.box.split(',')); empty = np.array(list(map(int, a.empty.split(','))))
    if not (1 <= a.a < a.b <= len(files)): ap.error('1 ≤ A < B ≤ 프레임 수')
    os.makedirs(a.out, exist_ok=True)
    cell = lambda i: np.asarray(Image.open(files[i - 1]).convert('RGB')).astype(np.float64)[y0:y1, x0:x1]
    ra, rb = cell(a.a), cell(a.b)
    changed = []
    for i, f in enumerate(files, 1):
        dst = os.path.join(a.out, os.path.basename(f))
        if not a.a < i < a.b: shutil.copyfile(f, dst); continue
        rgb = np.asarray(Image.open(f).convert('RGB')).copy()
        cur = rgb[y0:y1, x0:x1].astype(np.float64)
        w = (i - a.a) / (a.b - a.a)
        ref = cell(a.ref) if a.ref else (1 - w) * ra + w * rb
        lum = cur.sum(2)
        chroma = cur / np.maximum(lum, 1)[..., None]
        mask = (np.abs(chroma - empty / empty.sum()).max(2) <= a.tol) & (lum >= 0.3 * empty.sum())
        mask = ndi.binary_opening(mask, iterations=1)            # 앞을 지나는 물체 가장자리의 낱낱 화소는 건드리지 않는다
        shade = np.clip(lum / (0.92 * empty.sum()), 0, 1)[..., None]   # 빈칸의 보통 밝기 둘레(92% 이상)는 1, 그보다 어두운 그림자만 따라 어둡게
        wgt = np.clip(ndi.gaussian_filter(mask.astype(np.float64), 1.0), 0, 1)[..., None]
        rgb[y0:y1, x0:x1] = np.clip((cur * (1 - wgt) + ref * shade * wgt).round(), 0, 255).astype(np.uint8)
        Image.fromarray(rgb).save(dst); changed.append((i, int(mask.sum())))
        if a.compare:
            os.makedirs(a.compare, exist_ok=True)
            pad = 30; box = (max(0, x0 - pad), max(0, y0 - pad), min(rgb.shape[1], x1 + pad), min(rgb.shape[0], y1 + pad))
            before = Image.open(f).convert('RGB').crop(box); after = Image.fromarray(rgb).crop(box)
            pair = Image.new('RGB', (before.width * 2, before.height)); pair.paste(before, (0, 0)); pair.paste(after, (before.width, 0))
            pair.save(os.path.join(a.compare, f'{i:03d}.png'))
    print(f'{len(files)}장 · 바꾼 프레임 {len(changed)} ({a.a + 1}~{a.b - 1}번) · 프레임당 바꾼 화소 최소 {min(c for _, c in changed)} 최대 {max(c for _, c in changed)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

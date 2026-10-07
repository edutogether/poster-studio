"""Poster Studio 대기 영상 검수: 흰 배경 위에 생긴 가는 선(실·끈·와이어)을 프레임마다 찾는다.

왜(2026-10-08): 05번 첫 생성에서 신발 위로 원화에 없는 가는 실이 화면 위쪽까지 뻗었다(5.7~7.0초). 얼굴 검사는 얼굴판만 보므로
이런 것을 못 잡는다. 흰 배경(둘레 15화소 중앙값이 밝은 곳)에서 주변보다 어두운 가는 화소(검은 탑햇)를 모아, 길이 LONG화소 이상이고
폭이 WIDE화소 이하인 덩어리를 «가는 선»으로 센다. 원화에 이미 있는 가는 선(소품 테두리 등)은 원화에서도 같은 자리에 있으므로 뺀다.

자기검사: 05번 첫 생성(try1)에서 실이 보이던 프레임(141번 등)을 잡는지 본다(--selftest <프레임 폴더> <꼭 잡아야 할 프레임>).
사용: python scripts/media/check-thin-lines.py <장면> <프레임 폴더> [--json 결과.json]
종료코드 0 = 가는 선 없음 · 1 = 가는 선 있는 프레임 있음 · 2 = 사용법 오류(프레임 0장 등)
"""
import argparse, glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.join(HERE, '..', '..', '_docs', 'intents', '2026-09-30-studio-design-integration', 'loading-approved-2026-10-01', 'assets')
BG = 225        # 둘레 중앙값이 이보다 밝으면 흰 배경
CHROMA = 10     # 흰 배경의 색 기운 상한(최댓값-최솟값). 크림색 로봇 몸은 15 넘음
DROP = 18       # 둘레보다 이만큼 어두우면 선 화소
LONG = 30       # 이 길이(화소) 이상이면 «선»
WIDE = 5        # 폭(두께의 두 배) 이 이하
ART_NEAR = 6    # 원화의 가는 선에서 이 거리 안이면 원래 있던 선


def thin_lines(rgb):
    g = rgb.astype(np.float64).mean(2)
    chroma = rgb.max(2).astype(np.float64) - rgb.min(2)
    # 흰 배경 = 둘레 중앙값이 밝고 색이 없는 곳. 크림색 로봇 몸(밝기는 비슷하나 빨강-파랑 차이 15~30)의 이음선을 실로 잡지 않게(05번 실측)
    bg = (ndi.median_filter(g, size=15) >= BG) & (ndi.median_filter(chroma, size=15) <= CHROMA)
    hat = ndi.grey_closing(g, size=(7, 7)) - g               # 검은 탑햇: 둘레보다 어두운 가는 것
    m = bg & (hat >= DROP)
    lab, n = ndi.label(m, structure=np.ones((3, 3)))
    keep = np.zeros(m.shape, bool)
    for j, sl in enumerate(ndi.find_objects(lab), 1):
        comp = lab[sl] == j
        h, w = comp.shape
        if max(h, w) < LONG: continue
        if 2 * ndi.distance_transform_edt(comp).max() > WIDE: continue
        keep[sl] |= comp
    return keep


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('--json'); ap.add_argument('--selftest', type=int)
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    art = np.asarray(Image.open(os.path.join(ART_DIR, f'{a.scene.zfill(2)}.png')).convert('RGB').resize((704, 704), Image.LANCZOS))
    art_near = ndi.binary_dilation(thin_lines(art), iterations=ART_NEAR)
    rows = []
    for i, f in enumerate(files, 1):
        k = thin_lines(np.asarray(Image.open(f).convert('RGB'))) & ~art_near
        if k.sum():
            ys, xs = np.nonzero(k)
            rows.append({'frame': i, 'sec': round((i - 1) / 24, 2), 'px': int(k.sum()), 'box': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]})
    if a.json: json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    hit = [r['frame'] for r in rows]
    runs = []
    for n in hit:
        if runs and n == runs[-1][1] + 1: runs[-1][1] = n
        else: runs.append([n, n])
    print(f'{os.path.basename(a.src.rstrip("/"))}: {len(files)}프레임 · 가는 선 {len(hit)}프레임 ' + ' '.join(f'{x}~{y}번({(x - 1) / 24:.2f}~{(y - 1) / 24:.2f}초)' for x, y in runs))
    if a.selftest is not None:
        ok = a.selftest in hit
        print(f'자기검사 · {a.selftest}번 프레임의 실: {"걸림" if ok else "놓침"}')
        return 0 if ok else 1
    return 1 if hit else 0


if __name__ == '__main__':
    sys.exit(main())

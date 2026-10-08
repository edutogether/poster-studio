"""Poster Studio 대기 영상 키프레임: 움직이지 않는 그림판을 기준 키프레임(K1)의 화소로 고정한 새 키프레임을 만든다(2026-10-08).

왜: 02번 K2를 ChatGPT로 그릴 때 팔을 옮기면서 그림판 왼쪽 아래 그림(빨간 지붕 집·나무·수레 길)까지 다시 그려 K1과 달라졌고,
Veo가 그 둘 사이를 이어 3.0~5.0초 동안 그림판이 바뀌었다(팀장 검토 10/8 18:56). 그림판은 움직이지 않는 소품이므로
모든 키프레임에서 K1과 같은 화소여야 한다.

방법: 결과 = 바꿀 키프레임(base). 그림판 사변형(--board) 안에서
  · base의 팔·손·연필 다각형(--base-poly) 안 → base 그대로(팔은 base의 것)
  · 기준 키프레임의 팔·손·연필 다각형(--ref-poly) 안 → base 그대로(기준 키프레임에서 손에 가려 안 보이던 그림 — base에만 있다)
  · 그 밖 → 기준 키프레임(K1) 화소. base 팔이 그림판에 드리운 그림자는 «base 밝기 ÷ 기준 밝기»를 넓게 흐려 곱해 옮긴다.
다각형은 손으로 짚은 것이라 팔보다 넉넉하게(--grow 화소) 넓히고, 경계는 흐려(--feather) 섞는다 — 넉넉한 띠에는 base의
그림판 화소가 남지만 base와 기준의 그림판은 그 띠에서 거의 같다(검사로 확인).
다각형 파일(JSON): {"board": [[x,y],...], "base_poly": [[[x,y],...], ...], "ref_poly": [[[x,y],...], ...]} — 원화 화소 좌표.
사용: python scripts/media/compose-keyframe-board.py <base.png> <기준.png> <다각형.json> <출력.png> [--grow 4] [--feather 1.5] [--check 확인그림.png]
"""
import argparse, json, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def poly_mask(shape, polys):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    for p in polys: d.polygon([tuple(map(float, q)) for q in p], fill=255)
    return np.asarray(m) > 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('base'); ap.add_argument('ref'); ap.add_argument('polys'); ap.add_argument('out')
    ap.add_argument('--grow', type=int, default=4); ap.add_argument('--feather', type=float, default=1.5); ap.add_argument('--check')
    a = ap.parse_args()
    base = np.asarray(Image.open(a.base).convert('RGB')).astype(np.float64)
    ref = np.asarray(Image.open(a.ref).convert('RGB')).astype(np.float64)
    if base.shape != ref.shape: print('두 키프레임 크기가 다르다', file=sys.stderr); return 2
    P = json.load(open(a.polys, encoding='utf-8'))
    board = poly_mask(base.shape, [P['board']])
    keep_base = ndi.binary_dilation(poly_mask(base.shape, P['base_poly']), iterations=a.grow)
    keep_ref_hidden = ndi.binary_dilation(poly_mask(base.shape, P.get('ref_poly', [])), iterations=a.grow)
    use_ref = board & ~keep_base & ~keep_ref_hidden
    if not use_ref.any(): print('기준 화소로 바꿀 곳이 0 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    w = np.clip(ndi.gaussian_filter(use_ref.astype(np.float64), a.feather), 0, 1)[..., None]
    # base 팔의 그림자: 팔 둘레 띠에서 밝기 비율을 넓게 흐려 기준 화소에 곱한다(그림판 결의 차이는 흐림으로 사라진다)
    lb, lr = base.mean(2), ref.mean(2)
    band = board & ndi.binary_dilation(keep_base, iterations=40) & ~keep_base
    ratio = np.ones(lb.shape)
    if band.any():
        num = ndi.gaussian_filter(np.where(band, lb, 0), 8); den = ndi.gaussian_filter(np.where(band, lr, 0), 8)
        wt = ndi.gaussian_filter(band.astype(np.float64), 8)
        r = np.where(wt > 0.2, num / np.maximum(den, 1), 1.0)
        ratio = np.where(band, np.clip(r, 0.55, 1.0), 1.0)
        ratio = ndi.gaussian_filter(ratio, 3)
    refs = ref * ratio[..., None]
    out = base * (1 - w) + refs * w
    Image.fromarray(np.clip(out.round(), 0, 255).astype(np.uint8)).save(a.out)
    changed = np.abs(out - base).max(2) > 12
    print(f'그림판 {int(board.sum())}화소 중 기준 키프레임 화소로 바꾼 곳 {int(use_ref.sum())} · base와 12 넘게 달라진 화소 {int(changed.sum())}'
          f' · 그림자 띠 최소 밝기 비율 {ratio.min():.2f}')
    if a.check:
        vis = base.astype(np.uint8).copy()
        e = keep_base & ~ndi.binary_erosion(keep_base, iterations=2); vis[e] = (255, 0, 255)
        e2 = keep_ref_hidden & ~ndi.binary_erosion(keep_ref_hidden, iterations=2); vis[e2] = (0, 200, 255)
        Image.fromarray(vis).save(a.check)
    return 0


if __name__ == '__main__':
    sys.exit(main())

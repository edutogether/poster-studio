"""Poster Studio 대기 영상 누끼(RGBA)에서 움직이지 않아야 할 소품 자리를 기준 프레임 그대로 고정한다(2026-10-08, 계획 B).

왜: 06번 삼각대는 바닥에 서 있어 움직이지 않아야 하는데 생성 영상에서 다리 모양·자리가 프레임마다 어긋났다(Bumm님 판정 6
«삼각대 다리가 안 맞음»). 다리 자리(다각형)를 첫 프레임(원화와 같은 장면)의 색·투명도로 모든 프레임에 덮는다. 손이 닿는 윗부분
(카메라·머리)은 다각형에서 뺀다. 경계는 --feather화소로 섞는다. 색과 투명도를 함께 덮어야 흰 대기 화면 위에서도 다리 모양이 같다.
사용: python scripts/media/paste-static-rgba.py <RGBA 폴더> <새 출력 폴더> --ref 1 --poly "x,y x,y ..." [--feather 4] [--frames 1-192]
"""
import argparse, glob, os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--ref', type=int, default=1); ap.add_argument('--poly', required=True)
    ap.add_argument('--feather', type=float, default=4); ap.add_argument('--frames', default='')
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    assert not os.path.exists(a.out), f'출력 폴더가 이미 있다: {a.out}'
    os.makedirs(a.out)
    ref = np.asarray(Image.open(files[a.ref - 1]).convert('RGBA')).astype(np.float64)
    pts = [tuple(float(v) for v in p.split(',')) for p in a.poly.split()]
    m = Image.new('L', (ref.shape[1], ref.shape[0]), 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    w = ndi.gaussian_filter(np.asarray(m, np.float64) / 255, a.feather)[..., None] if a.feather else (np.asarray(m) > 0)[..., None].astype(np.float64)
    todo = set(range(1, len(files) + 1))
    if a.frames: todo = {x for part in a.frames.split(',') for x in range(int(part.split('-')[0]), int(part.split('-')[-1]) + 1)}
    n = 0
    for i, f in enumerate(files, 1):
        dst = os.path.join(a.out, os.path.basename(f))
        if i not in todo: shutil.copyfile(f, dst); continue
        im = np.asarray(Image.open(f).convert('RGBA')).astype(np.float64)
        Image.fromarray(np.clip((im * (1 - w) + ref * w).round(), 0, 255).astype(np.uint8), 'RGBA').save(dst); n += 1
    print(f'{len(files)}장 · 덮은 프레임 {n} · 다각형 넓이 {int((np.asarray(m) > 0).sum())}화소 · 기준 {a.ref}번')
    return 0


if __name__ == '__main__':
    sys.exit(main())

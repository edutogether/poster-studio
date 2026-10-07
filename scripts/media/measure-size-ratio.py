"""Poster Studio 대기 영상 11번 검수: 프레임마다 «아이/엄마» 크기 비를 재서 원화 기준 ±5% 띠 그래프와 표를 만든다.

왜(2026-10-08 Bumm님 «나중에 영상도 크기 고정 안 되는 거 아니야?»): 첫·끝 장면 크기가 같아도 사이 프레임에서 아이가 커지거나
작아질 수 있다. 화면 전체가 당겨지거나 밀려도 흔들리지 않게 «아이/엄마 비»로 본다.
잣대: 두 로봇의 빨간 안테나 공 지름(공 아래 검은 막대가 있는 빨간 둥근 덩어리). 공은 구라서 고개를 돌려도 지름이 그대로이고, 머리 폭과 같은 비율로 그려져 있다(원화 아이/엄마
0.84). 프레임마다 빨간 둥근 덩어리 중 위쪽 두 개를 공으로 보고, 작은 쪽을 아이로 센다. 공이 가려져 둘 다 안 보이는 프레임은
«못 잼»으로 따로 적는다(잰 것처럼 채우지 않는다).
공의 그려진 크기는 그림마다 조금씩 달라(확정 끝 장면은 머리 폭이 원화와 1% 차이인데 공 비는 +7%) 원화 하나가 아니라 «원화와 끝 장면 사이»를
허용 띠로 본다: 두 그림의 비 가운데 작은 값의 −5%부터 큰 값의 +5%까지.
사용: python scripts/media/measure-size-ratio.py <프레임 폴더> <출력 폴더> [--ref 원화 그림] [--keys 끝 장면 그림 ...]
출력: ratio.csv(프레임·초·엄마 공·아이 공·비·원화 대비) · ratio.png(±5% 띠 그래프) · 벗어난 구간을 표준 출력에 적는다.
"""
import argparse, csv, glob, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ART = os.path.join(HERE, '..', '..', '_docs', 'intents', '2026-09-30-studio-design-integration', 'loading-approved-2026-10-01', 'assets', '11.png')
BAND = 0.05


def balls(rgb):
    r, g, b = (rgb[..., k].astype(np.int32) for k in range(3))
    red = (r > 170) & (g < 80) & (b < 80)
    lab, n = ndi.label(red)
    out = []
    for j, sl in enumerate(ndi.find_objects(lab), 1):
        m = lab[sl] == j; h, w = m.shape
        if not (0.02 * rgb.shape[1] <= w <= 0.07 * rgb.shape[1] and 0.75 <= w / h <= 1.33 and m.sum() >= 0.6 * w * h): continue
        # 안테나 공은 바로 아래(공 지름만큼, 공 폭 안)에 검은 막대가 있다 — 빨간 목도리·신발의 둥근 조각을 공으로 잡지 않게(11번 4~7초 실측).
        # 막대는 가운데에 흰 윤기가 있고 기울기도 해서 한 줄이 아니라 상자 안의 검은 화소 비율로 본다
        stick = rgb[sl[0].stop:sl[0].stop + h, sl[1]].max(2)
        if stick.size == 0 or (stick < 90).mean() < 0.08: continue
        out.append({'d': (w + h) / 2, 'y': sl[0].start, 'x': sl[1].start})
    out.sort(key=lambda t: t['y'])
    return out[:2]


def ratio(rgb):
    bs = balls(rgb)
    if len(bs) < 2: return None, None, None
    small, big = sorted(bs, key=lambda t: t['d'])
    return big['d'], small['d'], small['d'] / big['d']


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--ref', default=ART); ap.add_argument('--keys', nargs='*', default=[])
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: raise SystemExit('프레임 0장 — 대상이 없으면 통과가 아니라 실패다')
    _, _, ref = ratio(np.asarray(Image.open(a.ref).convert('RGB')))
    if ref is None: raise SystemExit('기준 그림에서 공 두 개를 못 찾았다')
    ends = [ratio(np.asarray(Image.open(p).convert('RGB')))[2] for p in a.keys]
    if any(e is None for e in ends): raise SystemExit('끝 장면 그림에서 공 두 개를 못 찾았다')
    lo_ok, hi_ok = min([ref] + ends) * (1 - BAND), max([ref] + ends) * (1 + BAND)
    os.makedirs(a.out, exist_ok=True)
    rows = []
    for i, f in enumerate(files, 1):
        mom, kid, r = ratio(np.asarray(Image.open(f).convert('RGB')))
        rows.append({'frame': i, 'sec': round((i - 1) / 24, 2), 'mom': mom, 'kid': kid, 'ratio': r, 'dev': None if r is None else r / ref - 1,
                     'out': r is not None and not (lo_ok <= r <= hi_ok)})
    with open(os.path.join(a.out, 'ratio.csv'), 'w', newline='', encoding='utf-8') as fp:
        w = csv.writer(fp); w.writerow(['프레임', '초', '엄마 공', '아이 공', '아이/엄마', '원화 대비'])
        for r in rows: w.writerow([r['frame'], r['sec'], r['mom'], r['kid'], '' if r['ratio'] is None else f"{r['ratio']:.3f}", '못 잼' if r['dev'] is None else f"{r['dev'] * 100:+.1f}%"])
    # 그래프(원화 비 기준선 · ±5% 띠)
    W, H, L, T = 1600, 600, 80, 40; im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 18)
    lo, hi = ref * 0.8, ref * 1.2
    Y = lambda v: T + (hi - v) / (hi - lo) * (H - T - 60); X = lambda i: L + (i - 1) / (len(rows) - 1) * (W - L - 40)
    d.rectangle([L, Y(hi_ok), W - 40, Y(lo_ok)], fill=(220, 240, 220))
    for e in ends: d.line([L, Y(e), W - 40, Y(e)], fill=(200, 120, 0), width=2)
    d.line([L, Y(ref), W - 40, Y(ref)], fill=(0, 140, 0), width=2)
    pts = [(X(r['frame']), Y(r['ratio'])) for r in rows if r['ratio'] is not None]
    for p, q in zip(pts, pts[1:]): d.line([p, q], fill=(30, 60, 200), width=2)
    for r in rows:
        if r['out']: d.ellipse([X(r['frame']) - 4, Y(r['ratio']) - 4, X(r['frame']) + 4, Y(r['ratio']) + 4], fill=(220, 0, 0))
    for s in range(0, 9): d.text((X(s * 24 + 1) - 8, H - 50), f'{s}초', fill=(0, 0, 0), font=font)
    d.text((L, 8), f'아이/엄마 안테나 공 지름 비 — 원화 {ref:.3f}(초록) · 끝 장면 {" ".join(f"{e:.3f}" for e in ends)}(주황) · 두 그림 사이 ±5% 띠(연두) · 벗어난 프레임 빨강', fill=(0, 0, 0), font=font)
    im.save(os.path.join(a.out, 'ratio.png'))
    out = [r for r in rows if r['out']]; miss = [r['frame'] for r in rows if r['dev'] is None]
    def runs(ns):
        res = []
        for n in ns:
            if res and n == res[-1][1] + 1: res[-1][1] = n
            else: res.append([n, n])
        return ' '.join(f'{x}~{y}번({(x - 1) / 24:.2f}~{(y - 1) / 24:.2f}초)' for x, y in res)
    print(f'원화 비 {ref:.3f} · 끝 장면 비 {" ".join(f"{e:.3f}" for e in ends)} · 허용 띠 {lo_ok:.3f}~{hi_ok:.3f} · 잰 프레임 {len(rows) - len(miss)} · ±5% 벗어남 {len(out)}프레임 {runs([r["frame"] for r in out])} · 못 잼 {len(miss)}프레임 {runs(miss)}')
    devs = [r['dev'] for r in rows if r['dev'] is not None]
    if devs: print(f'원화 대비 최소 {min(devs) * 100:+.1f}% · 최대 {max(devs) * 100:+.1f}%')


if __name__ == '__main__':
    main()

"""Poster Studio 대기 영상 검수: 원화에 없는 얼굴 요소(눈썹·입·코 등)가 생겼는지 프레임마다 확인한다.

규칙(2026-10-06 Bumm님 확정): 영상에서 눈썹·입을 새로 만들지 않는다. 얼굴은 원화 그대로.
원화의 얼굴 = 빛나는 주황 눈 두 개 + 검은 얼굴판 위의 «어두운» 미소선(08번만 빨간 혀가 보이는 벌린 입).
어두운 미소선은 밝지 않아 표시로 세지 않는다. 영상이 만든 하얗게 빛나는 입·빨간 입·주황 눈썹이 탈락 대상이다.
그래서 «원화에 없던 것»만 탈락시킨다(원화에 있던 종류는 원화 크기의 2.5배까지 허용).

방법
  1. 얼굴 위치: `face-regions.json`에 원화별 얼굴판 상자와 미소선 자리를 사람이 확인해 적어 두었다(11번은 둘).
     영상은 원화 장면에서 시작하므로 첫 프레임에서 그 상자로 출발해, 앞 프레임의 얼굴 조각과 가장 닮은 곳(정규화 상관)을
     프레임마다 찾아 따라간다. 그림 전체에서 얼굴판을 찾으면 슬레이트·피아노 같은 검은 소품을 잡기 때문이다.
  2. 얼굴판: 상자 안의 큰 어두운 덩어리(가장 밝은 채널 < 70)를 감싸는 볼록 다각형. 안쪽에 눈빛이 없으면
     (고개를 돌렸거나 눈을 감음) «확인 못 한 프레임»으로 번호를 따로 낸다 — 통과로 치지 않는다(종료코드 3).
     눈을 감은 프레임에 흰 입이 생긴 경우가 실제로 있었다(04번 시험 영상) — 그 프레임은 사람이 본다.
  3. 표시: 얼굴판 안쪽에서 주변보다 확 밝은 화소(국소 대비 ≥ 45, 밝기 ≥ 100). 넓고 은은한 반사광은 빠진다.
  4. 판정(크기 기준 = 원화 눈 넓이의 15%):
     · 따뜻한 빛(주황)인데 어느 눈 바로 위 → 눈썹(눈보다 크게 그려져도), 두 눈 선보다 눈 높이만큼 넘게 아래 → 입.
       눈높이의 빛 조각은 눈의 일부(깜박임). «아래»는 두 눈 중심을 잇는 선에서 수직으로 잰다(고개가 기울어도 같은 기준).
     · 빨간 표시(빨간 입·혀, 초록≈파랑인 진짜 빨강) → 입. 두 눈 선보다 눈 높이의 절반 넘게 아래인 아주 밝은 흰 표시 → 입.
       눈높이의 흰 점(깜박일 때 눈이 점으로 보임)과 얼굴판 위쪽 회색 반사광은 세지 않는다.
  5. --selftest: 원화에 가짜 눈썹·흰 입·빨간 입을 그려 넣어 각각 걸리는지 확인한다(빈 게이트 방지).
  6. --all-mouths: 원화에 있던 입도 탈락으로 센다 — 08번을 «입만 지워» 다른 장면과 같은 얼굴로 맞춘 2026-10-07 Bumm님 결정용.
     08번은 얼굴판 흰 테두리·팝 필터 테두리가 얼굴판 볼록 다각형 안에 들어와 «입»으로 잘못 세는 프레임이 있다 —
     이 모드의 탈락은 전후 그림으로 사람이 본다(2026-10-07 192장 확인: 입 없음, 걸린 104프레임은 모두 테두리).

사용: python scripts/media/check-face-elements.py <장면번호 01~12> <프레임 폴더 또는 영상 파일> [--json 결과.json] [--marks 표시그림폴더] [--all-mouths]
      python scripts/media/check-face-elements.py <장면번호> --selftest
필요: numpy · scipy · Pillow, 영상 파일이면 ffmpeg.
종료코드 0 = 통과, 1 = 새 얼굴 요소 발견 → 탈락(또는 자기검사 실패), 2 = 사용법·기준 오류,
         3 = 새 요소는 없지만 눈빛이 안 보이거나 얼굴 앞에 무언가 겹쳐 확인 못 한 프레임이 있다 → 출력된 프레임을 사람이 본다.
"""
import argparse
import glob
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.signal import fftconvolve
from scipy.spatial import ConvexHull

HERE = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.join(HERE, '..', '..', '_docs', 'intents', '2026-09-30-studio-design-integration', 'loading-approved-2026-10-01', 'assets')
DARK = 70            # 얼굴판으로 보는 어두움
GLOW_MIN = 30        # 얼굴판 안쪽에 있어야 할 눈빛 화소 최소 수
CONTRAST = 45        # 주변(중앙값)보다 이만큼 밝아야 표시
BRIGHT = 100         # 표시의 최소 밝기
WARM_SHARE = 0.15    # 표시와 둘레 3화소의 밝은 화소 중 이 비율 이상이 따뜻한 빛이면 «따뜻한 표시»
EXTRA_RATIO = 0.15   # 원화 눈 넓이(얼굴 크기로 환산) 대비 이 비율 이상이면 요소로 센다
ALLOW_GROWTH = 2.5   # 원화에 있던 종류는 원화 크기의 이 배수까지 허용
BAND_PAD = 0.08      # 눈높이 띠를 위아래로 얼굴판 높이의 이 비율만큼 넓힌다
SEARCH = 0.3         # 추적할 때 앞 프레임 위치에서 상자 크기의 이 비율만큼 둘러본다
EXPAND = 0.35        # 얼굴 상자를 사방으로 이 비율만큼 넓혀 얼굴판 전체를 본다 — 고개를 돌리면 얼굴판이 상자 밖으로 나가
                     # 입 절반을 놓쳤다(2026-10-07 01번). 얼굴판은 «원래 상자와 겹치고, 넓이의 25% 이상이 상자 안인» 어두운 덩어리다
CORE_SHARE = 0.25
ENCLOSED = 0.82      # 표시의 둘레(3~7화소 띠, 얼굴판 안·눈빛 제외)에서 밝기 SCREEN_MAX 미만(검은 얼굴판·회색 반사광)이 이 비율 이상일 때만
SCREEN_MAX = 130     # 얼굴 요소로 센다. 2026-10-07 실측: 진짜 입 ≈1.0, 자기검사 가짜 눈썹·입 0.88 이상, 얼굴 앞을 지나는 03번 슬레이트
                     # 흰 줄무늬 0.65~0.77 — 소품은 «가려짐»으로 빼서 사람이 본다


def warm_mask(rgb):
    r, b = rgb[..., 0].astype(np.int32), rgb[..., 2].astype(np.int32)
    return (r > 170) & (r - b > 60)


def hull_mask(mask):
    ys, xs = np.nonzero(mask)
    poly = np.c_[xs, ys][ConvexHull(np.c_[xs, ys]).vertices]
    im = Image.new('1', (mask.shape[1], mask.shape[0]), 0)
    ImageDraw.Draw(im).polygon([tuple(int(q) for q in p) for p in poly], fill=1)
    return np.asarray(im, dtype=bool)


def expand(box, shape):
    """얼굴 상자를 EXPAND만큼 넓힌 영역과, 그 안에서 원래 상자의 자리(core)."""
    x0, y0, x1, y1 = box; px, py = int(EXPAND * (x1 - x0)), int(EXPAND * (y1 - y0))
    X0, Y0, X1, Y1 = max(0, x0 - px), max(0, y0 - py), min(shape[1], x1 + px), min(shape[0], y1 + py)
    return [X0, Y0, X1, Y1], (x0 - X0, y0 - Y0, x1 - X0, y1 - Y0)


def face_marks(crop, core=None):
    """얼굴판의 표시 덩어리. 얼굴판이 안 보이면 None. 좌표는 crop 기준.
    core = crop 안의 원래 얼굴 상자(없으면 crop 전체). 크기 기준은 모두 core로 잰다."""
    v = crop.max(2).astype(np.int32)
    warm = warm_mask(crop)
    cx0, cy0, cx1, cy1 = core or (0, 0, crop.shape[1], crop.shape[0]); ch, cw = cy1 - cy0, cx1 - cx0
    lab, n = ndi.label(ndi.binary_closing(v < DARK, iterations=3))
    if not n: return None
    idx = range(1, n + 1)
    sizes = ndi.sum(np.ones(lab.shape), lab, idx)
    in_core = ndi.sum(np.ones((ch, cw)), lab[cy0:cy1, cx0:cx1], idx)
    # 상자 넓이의 5% 이상이고 넓이의 CORE_SHARE 이상이 상자 안인 어두운 덩어리만(상자 밖 검은 손·소품은 빼고, 상자 밖으로 나간 얼굴판은 끝까지)
    keep = np.isin(lab, 1 + np.flatnonzero((sizes >= 0.05 * ch * cw) & (in_core >= CORE_SHARE * sizes)))
    if keep.sum() < 50: return None
    hull = hull_mask(keep)
    inner = ndi.binary_erosion(hull, iterations=max(3, int(0.04 * min(ch, cw))))
    if (warm & inner).sum() < GLOW_MIN: return None
    local = ndi.median_filter(v, size=max(9, int(0.25 * ch) | 1))
    mark = inner & (v - local >= CONTRAST) & (v >= BRIGHT)
    mark = ndi.binary_dilation(mark, iterations=1) & inner
    r, g, b = (crop[..., k].astype(np.int32) for k in range(3))
    red = (r > 150) & (g < 90) & (np.abs(g - b) < 35)   # 진짜 빨강은 초록≈파랑. 눈의 주황빛은 초록이 파랑보다 훨씬 크다
    mlab, count = ndi.label(mark)
    comps = []
    for j in range(1, count + 1):
        m = mlab == j
        ring = ndi.binary_dilation(m, iterations=3) & hull & (v >= BRIGHT)   # 눈은 가운데가 거의 흰색, 둘레가 주황
        ys, xs = np.nonzero(m)
        # 얼굴판 안쪽 둘레만, 눈빛(주황) 화소는 빼고 잰다 — 얼굴판 가장자리 근처 입·눈 바로 위 눈썹도 «둘러싸임»으로 센다
        around = ndi.binary_dilation(m, iterations=7) & ~ndi.binary_dilation(m, iterations=3) & hull & ~warm
        comps.append({'idx': j, 'enclosed': float((v[around] < SCREEN_MAX).mean()) if around.any() else 0.0, 'area': int(m.sum()), 'warm': float(warm[ring].mean()) if ring.any() else 0.0, 'red': float(red[m].mean()),
                      'peak': float(np.percentile(v[m], 95)), 'box': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]})
    comps.sort(key=lambda c: -c['area'])
    rows = np.nonzero(hull.any(1))[0]
    # labels·hull은 지우기 보정(remove-face-marks.py)이 덩어리 화소와 얼굴판 영역을 찾는 데 쓴다
    return {'top': int(rows.min()), 'height': int(rows.max() - rows.min() + 1), 'marks': comps, 'inner': inner, 'hull': hull, 'labels': mlab}


def x_overlap(a, b):
    return max(0, min(a['box'][2], b['box'][2]) - max(a['box'][0], b['box'][0])) / max(1, min(a['box'][2] - a['box'][0], b['box'][2] - b['box'][0]))


def classify(face, eye_area, band=None):
    """표시를 눈과 그 밖(눈썹·입·기타)으로 나눈다. eye_area는 이 얼굴 크기로 환산한 원화 눈 넓이."""
    h = face['height']
    warm = [c for c in face['marks'] if c['warm'] >= WARM_SHARE and c['red'] < 0.3]
    big = [c for c in warm if c['area'] >= 0.5 * eye_area]
    # 눈 바로 위에 겹쳐 놓인 «가는» 빛은 눈이 아니라 눈썹이다(넓이가 눈보다 커도 눈으로 뽑지 않는다)
    def height(c): return c['box'][3] - c['box'][1] + 1
    eyes = [c for c in big if not any(o is not c and x_overlap(c, o) >= 0.4 and c['box'][3] < o['box'][1] and height(c) < 0.6 * height(o) for o in big)][:2]
    pad = BAND_PAD * h
    if eyes:
        top, bottom = min(c['box'][1] for c in eyes), max(c['box'][3] for c in eyes)
    elif band:   # 깜박이는 중이라 큰 눈이 없으면 원화의 눈높이를 쓴다
        top, bottom = face['top'] + band[0] * h, face['top'] + band[1] * h
    else:
        return eyes, []
    if len(eyes) == 2:   # 두 눈 중심을 잇는 선에서 수직으로 얼마나 아래인가(고개가 기울어도 같은 기준). 아래가 +
        (ax, ay), (bx, by) = sorted(((e['box'][0] + e['box'][2]) / 2, (e['box'][1] + e['box'][3]) / 2) for e in eyes)
        n = np.array([-(by - ay), bx - ax]) / max(1e-6, np.hypot(bx - ax, by - ay))
        eye_h = sum(e['box'][3] - e['box'][1] + 1 for e in eyes) / 2
        def below(c): return float(np.dot([(c['box'][0] + c['box'][2]) / 2 - ax, (c['box'][1] + c['box'][3]) / 2 - ay], n)) / eye_h
    else:                # 눈이 하나뿐이거나(옆모습) 깜박이는 중: 높이로 본다
        span = max(1, bottom - top)
        def below(c): return ((c['box'][1] + c['box'][3]) / 2 - bottom) / span + (0 if eyes else -BAND_PAD * h / span)
    out = []
    for c in face['marks']:
        if c['area'] < EXTRA_RATIO * eye_area or c in eyes: continue
        y0, y1 = c['box'][1], c['box'][3]
        if c['red'] >= 0.3:
            kind = '입' if y0 > top else '기타'                     # 빨간 입·혀
        elif c['warm'] >= WARM_SHARE:
            over = [e for e in eyes if x_overlap(c, e) >= 0.4]
            if (over and y1 < min(e['box'][1] for e in over)) or (not eyes and y1 < top - pad): kind = '눈썹'
            elif eyes and below(c) > 1.0: kind = '입'
            else: continue      # 눈높이의 빛 조각 = 눈의 일부. 깜박이는 중(큰 눈 없음)에는 따뜻한 점을 입으로 세지 않는다
        elif c['peak'] >= 200 and below(c) > (0.5 if len(eyes) == 2 else 0.0):
            kind = '입'                                             # 두 눈 선보다 눈 높이의 절반 넘게 아래인 흰 입
        else:
            continue            # 눈높이의 흰 점(깜박일 때 눈이 흰 점으로 보임)·얼굴판 위쪽 반사광은 세지 않는다
        if c['enclosed'] < ENCLOSED: kind = '가려짐'                  # 둘레가 검은 얼굴판이 아니면 얼굴 앞 소품일 수 있다 → 사람이 본다
        out.append({**c, 'kind': kind})
    return eyes, out


def reference(art, box):
    big, core = expand(box, art.shape)
    face = face_marks(art[big[1]:big[3], big[0]:big[2]], core)
    if face is None: return None
    warm = [c for c in face['marks'] if c['warm'] >= WARM_SHARE]
    if len(warm) < 2: return None
    eye_area = min(c['area'] for c in warm[:2])
    eyes, extras = classify(face, eye_area)
    if len(eyes) < 2: return None
    h, top = face['height'], face['top']
    allowed = {}
    for e in extras: allowed[e['kind']] = max(allowed.get(e['kind'], 0), e['area'])
    return {'eye_area': eye_area, 'height': h, 'allowed': allowed,
            'band': ((min(c['box'][1] for c in eyes) - top) / h, (max(c['box'][3] for c in eyes) - top) / h)}


def forbid_mouths(refs):
    """원화에 있던 입도 허용하지 않는다(--all-mouths). 08번 원화의 벌린 입까지 지우라는 2026-10-07 Bumm님 결정용."""
    for r in refs: r['allowed'].pop('입', None)


def new_elements(face, ref, scale=1.0, occluded=None):
    """scale = 영상 화소 / 원화 화소. 원화에 없던 종류이거나 원화보다 2.5배 넘게 커진 요소만 돌려준다.
    occluded에 리스트를 주면 «가려짐»(얼굴 앞 소품일 수 있는 흰·빨간 표시)을 거기에 모은다 — 요소로는 세지 않는다."""
    area_scale = scale ** 2
    _, extras = classify(face, ref['eye_area'] * area_scale, ref['band'])
    if occluded is not None: occluded.extend(e for e in extras if e['kind'] == '가려짐')
    extras = [e for e in extras if e['kind'] != '가려짐']
    return [e for e in extras if e['area'] > ALLOW_GROWTH * ref['allowed'].get(e['kind'], 0) * area_scale]


def gray(rgb): return rgb.astype(np.float64) @ [0.299, 0.587, 0.114]


def track(prev_gray, cur_gray, box):
    """앞 프레임의 얼굴 조각과 가장 닮은 곳을 현재 프레임에서 찾는다(정규화 상관)."""
    H, W = cur_gray.shape
    x0, y0, x1, y1 = box; w, h = x1 - x0, y1 - y0; r = int(SEARCH * max(w, h))
    T = prev_gray[y0:y1, x0:x1]; T = T - T.mean(); tn = np.sqrt((T ** 2).sum()) + 1e-9
    sx0, sy0 = max(0, x0 - r), max(0, y0 - r); sx1, sy1 = min(W, x1 + r), min(H, y1 + r)
    S = cur_gray[sy0:sy1, sx0:sx1]
    num = fftconvolve(S, T[::-1, ::-1], mode='valid')
    ones = np.ones_like(T)
    s1 = fftconvolve(S, ones, mode='valid'); s2 = fftconvolve(S ** 2, ones, mode='valid')
    ncc = num / (np.sqrt(np.maximum(s2 - s1 ** 2 / T.size, 1e-9)) * tn)
    dy, dx = np.unravel_index(np.argmax(ncc), ncc.shape)
    return [int(sx0 + dx), int(sy0 + dy), int(sx0 + dx + w), int(sy0 + dy + h)]


def frames_of(path, tmp):
    if os.path.isdir(path): return sorted(glob.glob(os.path.join(path, '*.png')))
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', path, os.path.join(tmp, '%04d.png')], check=True)
    return sorted(glob.glob(os.path.join(tmp, '*.png')))


def selftest(art, faces, refs):
    """원화 얼굴에 가짜 눈썹·흰 입·빨간 입을 그려 넣으면 각각 걸려야 한다(빈 게이트 방지).
    눈썹은 각 눈 바로 위, 입은 원화의 미소선 자리(face-regions.json의 mouth). 원화에 입이 있는 08번은 입 대신 눈썹만 본다."""
    ok = True
    for fi, (spec, ref) in enumerate(zip(faces, refs)):
        big, core = expand(spec['face'], art.shape); crop = art[big[1]:big[3], big[0]:big[2]]
        face = face_marks(crop, core)
        eyes, _ = classify(face, ref['eye_area'])
        eh = max(8, min(e['box'][3] - e['box'][1] for e in eyes)); ew = max(e['box'][2] - e['box'][0] for e in eyes)
        lw = max(3, eh // 5); gap = max(0.4 * eh, 0.1 * face['height']) + lw
        mx, my = spec['mouth'][0] - big[0], spec['mouth'][1] - big[1]
        shapes = {
            '눈썹': lambda d: [d.line([e['box'][0], e['box'][1] - gap, e['box'][2], e['box'][1] - gap], fill=(255, 150, 40), width=lw) for e in eyes],
            '흰 입': lambda d: d.arc([mx - ew * 0.35, my - eh * 0.5, mx + ew * 0.35, my + eh * 0.2], 20, 160, fill=(250, 250, 250), width=lw),
            '빨간 입': lambda d: d.ellipse([mx - ew * 0.25, my - eh * 0.12, mx + ew * 0.25, my + eh * 0.18], fill=(230, 40, 40)),
        }
        for name, draw in shapes.items():
            if name.endswith('입') and '입' in ref['allowed']: continue
            im = Image.fromarray(crop.copy()); draw(ImageDraw.Draw(im))
            f = face_marks(np.asarray(im), core)
            caught = bool(f and new_elements(f, ref))
            print(f'자기검사 · 얼굴 {fi + 1} · 가짜 {name}: {"걸림" if caught else "못 잡음 ← 검사 결함"}')
            ok &= caught
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('source', nargs='?'); ap.add_argument('--json'); ap.add_argument('--marks')
    ap.add_argument('--fps', type=float, default=24.0); ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--all-mouths', action='store_true')   # 원화에 있던 입도 탈락으로 센다(08번, 2026-10-07 Bumm님 결정)
    a = ap.parse_args()
    with open(os.path.join(HERE, 'face-regions.json'), encoding='utf-8') as fp: regions = json.load(fp)
    scene = a.scene.zfill(2)
    if scene not in regions: print(f'장면 {scene} 없음', file=sys.stderr); return 2
    art = np.asarray(Image.open(os.path.join(ART_DIR, f'{scene}.png')).convert('RGB'))
    refs = [reference(art, f['face']) for f in regions[scene]]
    if any(r is None for r in refs):
        print(f'기준 오류: 원화 {scene}의 얼굴 상자에서 눈 두 개를 찾지 못했다 — 검사를 믿을 수 없다', file=sys.stderr); return 2
    if a.all_mouths: forbid_mouths(refs)
    if a.selftest: return 0 if selftest(art, regions[scene], refs) else 1
    if not a.source: ap.error('프레임 폴더 또는 영상 파일이 필요하다')
    with tempfile.TemporaryDirectory() as tmp:
        files = frames_of(a.source, tmp)
        if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
        first = np.asarray(Image.open(files[0]).convert('RGB'))
        s = first.shape[1] / art.shape[1]          # 영상은 원화를 같은 비율로 줄인 정사각형이다
        boxes = [[int(round(c * s)) for c in f['face']] for f in regions[scene]]
        rows, unseen, covered, prev = [], [], [], None
        for i, f in enumerate(files, 1):
            rgb = np.asarray(Image.open(f).convert('RGB')); g = gray(rgb)
            if prev is not None: boxes = [track(prev, g, b) for b in boxes]
            prev = g
            found = []
            for fi, (b, ref) in enumerate(zip(boxes, refs)):
                big, core = expand(b, rgb.shape)
                face = face_marks(rgb[big[1]:big[3], big[0]:big[2]], core)
                if face is None: unseen.append(i); continue
                hidden = []
                news = new_elements(face, ref, s, hidden)
                if hidden and not news: covered.append(i)
                for e in news:
                    e['box'] = [e['box'][0] + big[0], e['box'][1] + big[1], e['box'][2] + big[0], e['box'][3] + big[1]]
                    found.append({**e, 'face': fi + 1})
            if not found: continue
            rows.append({'frame': i, 'sec': round((i - 1) / a.fps, 2), 'kinds': sorted({e['kind'] for e in found}), 'extras': found})
            if a.marks:
                os.makedirs(a.marks, exist_ok=True)
                im = Image.fromarray(rgb); d = ImageDraw.Draw(im)
                for b in boxes: d.rectangle(b, outline=(0, 160, 255), width=2)
                for e in found: d.rectangle([e['box'][0] - 3, e['box'][1] - 3, e['box'][2] + 3, e['box'][3] + 3], outline=(255, 0, 200), width=2)
                im.save(os.path.join(a.marks, f'{i:04d}.png'))
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as fp:
            json.dump({'scene': scene, 'source': a.source, 'frames': len(files), 'face_unseen': sorted(set(unseen)), 'face_covered': sorted(set(covered)), 'flagged': len(rows), 'rows': rows}, fp, ensure_ascii=False, indent=1)
    def runs(nums, kinds=None):
        out = []
        for k, n in enumerate(nums):
            if out and n == out[-1][1] + 1: out[-1][1] = n; out[-1][2].update(kinds[k] if kinds else ())
            else: out.append([n, n, set(kinds[k] if kinds else ())])
        return out
    unseen = sorted(set(unseen)); covered = sorted(set(covered) - {r['frame'] for r in rows})
    flagged = runs([r['frame'] for r in rows], [r['kinds'] for r in rows])
    print(f'{os.path.basename(a.source.rstrip("/"))}: {len(files)}프레임 · 새 얼굴 요소 {len(rows)}프레임 · 확인 못 한 프레임 {len(unseen)}'
          + ''.join(f'\n  탈락 {s0}~{e0}번({(s0 - 1) / a.fps:.2f}~{(e0 - 1) / a.fps:.2f}초) {"·".join(sorted(k))}' for s0, e0, k in flagged)
          + ''.join(f'\n  사람 확인 {s0}~{e0}번({(s0 - 1) / a.fps:.2f}~{(e0 - 1) / a.fps:.2f}초) 눈빛이 안 보임(고개 돌림·눈 감음)' for s0, e0, _ in runs(unseen))
          + ''.join(f'\n  사람 확인 {s0}~{e0}번({(s0 - 1) / a.fps:.2f}~{(e0 - 1) / a.fps:.2f}초) 얼굴 앞에 무언가 겹침(소품일 수 있음)' for s0, e0, _ in runs(covered)))
    if rows: return 1
    return 3 if unseen or covered else 0


if __name__ == '__main__':
    sys.exit(main())

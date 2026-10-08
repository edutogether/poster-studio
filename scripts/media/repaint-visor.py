"""Poster Studio 대기 영상 얼굴 보정(2026-10-08 방식): 얼굴판 안에서 주황 눈 두 개만 남기고, 입 자리를 얼굴판 자체의 검정·윤기로 다시 칠한다.

왜: 입 화소를 하나하나 찾아 지우고 둘레로 메우던 방식(remove-face-marks.py)은 입이 얼굴판 가장자리에 닿거나 김·반사광과 겹치면
얼굴선을 무너뜨렸다(Bumm님 판정 4·10번). 그리고 입을 «찾는» 방식이라 덜 밝거나 어두운 입은 놓쳤다(3·7·9번 «입 안 지워짐»).
그래서 «무엇이 입인가»를 찾지 않고 «무엇을 남기는가»(눈 두 개)만 정한다. Bumm님 기준(2026-10-08): 원화의 어두운 미소선도 입으로 보고 지운다
(--keep-smile이면 어두운 미소선은 남긴다). 08번은 원화 입을 그대로 두므로 이 도구를 쓰지 않는다.

방법(프레임마다, 얼굴마다)
  1. 얼굴 상자를 앞 프레임에서 따라간다(check-face-elements.py와 같은 추적). 얼굴판 = 상자와 가장 많이 겹치는 어두운 덩어리의 구멍을 메운 것.
  2. 칠하는 곳 = 얼굴판을 RIM화소 안으로 줄인 영역 ∩ 원화 입 자리 둘레(얼굴 높이의 ZONE배, --zone full이면 얼굴판 전체).
     얼굴판 가장자리(테두리)는 건드리지 않는다.
  3. 남기는 것 = 주황 눈 두 개(가장 큰 주황 덩어리 둘, 가장 큰 것의 MIN_EYE배 이상)와 그 빛 번짐(EYE_GLOW화소).
  4. 새 값 = 얼굴판만 남긴 그림에서 «밝은 가는 것»을 지운 것(회색조 열림, 얼굴 높이의 SIZE배)과 «어두운 가는 것»을 메운 것(닫힘)을
     합친 값. 넓은 윤기·명암은 열림·닫힘에 남는다. 원래 값과의 차이만 살짝 흐리게(1화소) 더하고, 칠하는 곳 가장자리는 부드럽게 섞는다.
검사(--check, 보정 결과에 돌린다): ① 칠하는 곳 안에 눈이 아닌 밝은 화소·어두운 선이 없을 것 ② 얼굴판 윤곽이 앞뒤 프레임과 갑자기
달라지지 않을 것(얼굴선 무너짐). --selftest는 가짜 흰 입·어두운 미소선·테두리 홈을 그려 넣어 둘 다 걸리는지 본다.
  자기검사는 «보정한 결과»에 돌린다 — 보정 전 프레임에는 원화 미소선이 이미 있어서, 그 옆에 가짜 선을 그리면 둘이 한 굵은 띠가 되어
  «가는 선»이 아니게 된다(검사가 잡아야 할 모양이 아니다).
사용: python scripts/media/repaint-visor.py <장면> <원본 프레임> <출력 폴더> [--frames 1-192] [--faces 1,2] [--zone mouth|full] [--keep-smile] [--compare 폴더]
      python scripts/media/repaint-visor.py <장면> <프레임 폴더> --check [--json 결과.json] [--keep-smile]
      python scripts/media/repaint-visor.py <장면> <보정한 프레임 폴더> --selftest
"""
import argparse, glob, importlib.util, json, os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('gate', os.path.join(HERE, 'check-face-elements.py'))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)

RIM = 4            # 얼굴판 가장자리에서 이만큼 안쪽만 칠한다
ART_MARGIN = 0.0   # 원화 얼굴판 모양 안만 칠한다 — 바깥으로 넓히면 얼굴판 가장자리에 걸친 손가락 마디까지 칠했다(03번 113·129번)
ZONE = 0.45        # 원화 입 자리에서 얼굴 상자 높이의 이 배수 안을 칠한다(--zone mouth)
SIZE = 0.2         # 열림·닫힘 크기 = 얼굴 상자 높이의 이 배수(입선·미소선·벌린 입보다 크고 넓은 윤기보다 작게)
DARK_FILL = 6      # 닫힘이 원래보다 이만큼 넘게 밝으면 어두운 입 자리로 보고 메운다
MIN_EYE = 0.3      # 눈 = 가장 큰 주황 덩어리의 이 배수 이상인 덩어리(최대 2개)
EYE_GLOW = 9       # 눈 둘레 빛 번짐 — 칠하지 않는다
FEATHER = 1.5      # 칠한 곳 가장자리 섞기
# 검사 기준
BRIGHT_C, BRIGHT_V, BRIGHT_N = 35, 90, 15     # ① 둘레보다 35 넘게 밝고 90 이상인 화소가 15개 이상이면 «눈 아닌 밝은 것»
DARK_C, DARK_N, DARK_K = 10, 25, 0.1         # ① 닫힘(얼굴 높이의 0.1배)보다 10 넘게 어두운 화소가 25개 이상이면 «어두운 선(미소선·입)».
                                              #   닫힘을 칠할 때처럼 0.2배로 크게 잡으면 얼굴판의 넓은 그늘까지 미소선과 한 덩어리로 잡혀
                                              #   «두꺼운 그늘»로 빠졌다(자기검사 20번 실측: 1924화소 한 덩어리)
OUTLINE_PX, OUTLINE_X = 0.6, 3.0              # ② 앞뒤 둘 다와 다른 정도(화소)가 0.6 넘고 그 장면 중앙값의 3배 넘으면 «얼굴선 무너짐»


def load_regions(scene):
    return json.load(open(os.path.join(HERE, 'face-regions.json'), encoding='utf-8'))[scene]


def visor_of(crop, core):
    v = crop.max(2).astype(np.int32)
    cx0, cy0, cx1, cy1 = core
    lab, n = ndi.label(v < gate.DARK)
    if not n: return None
    overlap = ndi.sum(np.ones((cy1 - cy0, cx1 - cx0)), lab[cy0:cy1, cx0:cx1], range(1, n + 1))
    if overlap.max() < 0.05 * (cy1 - cy0) * (cx1 - cx0): return None
    return ndi.binary_fill_holes(lab == 1 + int(np.argmax(overlap)))


def eyes_of(crop, visor):
    r, g, b = (crop[..., k].astype(np.int32) for k in range(3))
    hue = (g - b) / np.maximum(r - b, 1)
    warm = (r > 170) & (r - b > 60) & (hue >= 0.2) & ndi.binary_dilation(visor, iterations=3)
    lab, n = ndi.label(warm)
    if not n: return np.zeros(visor.shape, bool)
    sizes = ndi.sum(warm, lab, range(1, n + 1)); order = np.argsort(-sizes)
    keep = [1 + j for j in order[:2] if sizes[j] >= MIN_EYE * sizes[order[0]]]
    main = np.isin(lab, keep)
    # 소품에 가려 눈이 조각나면(03번 113번: 슬레이트가 눈 다리를 가림) 조각도 눈이다 — 두 눈 가까이의 주황 조각은 함께 남긴다.
    # 멀리 떨어진 주황(11번 엄마 얼굴판에 비친 아들 눈)은 남기지 않는다
    near = ndi.binary_dilation(main, iterations=EYE_GLOW)
    frag = [j for j in range(1, n + 1) if j not in keep and (near & (lab == j)).any()]
    return main | np.isin(lab, frag)


def track_boxes(files, regions, faces):
    first = np.asarray(Image.open(files[0]).convert('RGB'))
    art_w = Image.open(os.path.join(gate.ART_DIR, f'{SCENE}.png')).width
    s = first.shape[1] / art_w
    boxes = [[int(round(c * s)) for c in regions[f]['face']] for f in faces]
    prev = None
    for f in files:
        rgb = np.asarray(Image.open(f).convert('RGB')); g = gate.gray(rgb)
        if prev is not None: boxes = [gate.track(prev, g, b) for b in boxes]
        prev = g
        yield rgb, [(fi, list(b), [regions[fi]['mouth'][k] * s - regions[fi]['face'][k] * s + b[k] for k in (0, 1)], s) for fi, b in zip(faces, boxes)]


ART_VISOR = {}
REGIONS = []


def art_visor(fi, scale):
    """원화의 얼굴판 모양(영상 크기로 줄인 것)과 그 얼굴 상자 왼쪽 위 — 얼굴 앞을 지나는 소품(슬레이트 검은 줄 등)이 얼굴판과
    이어져도 원화 얼굴판 모양 밖은 칠하지 않게 한다(03번 실측: 슬레이트 줄무늬까지 칠했다)."""
    if fi not in ART_VISOR:
        art = Image.open(os.path.join(gate.ART_DIR, f'{SCENE}.png')).convert('RGB')
        art = np.asarray(art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS))
        box = [int(round(c * scale)) for c in REGIONS[fi]['face']]
        big, core = gate.expand(box, art.shape)
        m = visor_of(art[big[1]:big[3], big[0]:big[2]], core)
        ART_VISOR[fi] = (m, (big[0] - box[0], big[1] - box[1]))
    return ART_VISOR[fi]


def thickness(m):
    """덩어리의 반두께(가장 깊은 안쪽 화소에서 가장자리까지). 덩어리 상자로 잘라 재므로 둘레를 1화소 비워야 한다 — 비우지 않으면
    상자 끝에 닿은 가는 선(호의 양 끝)이 상자 밖을 덩어리로 보고 두껍게 재져, 가는 흰 입이 «큰 흰 물체»로 빠졌다(자기검사 10번 실측)."""
    return ndi.distance_transform_edt(np.pad(m, 1)).max()


def zones(crop, big, core, mouth_xy, zone, fi=0, box=None, scale=1.0):
    visor = visor_of(crop, core)
    if visor is None: return None
    if box is not None:
        m, (ox, oy) = art_visor(fi, scale)
        placed = np.zeros(visor.shape, bool)
        y0, x0 = box[1] + oy - big[1], box[0] + ox - big[0]
        ys, xs = slice(max(0, y0), min(visor.shape[0], y0 + m.shape[0])), slice(max(0, x0), min(visor.shape[1], x0 + m.shape[1]))
        placed[ys, xs] = m[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0]
        visor = visor & (ndi.binary_dilation(placed, iterations=int(ART_MARGIN * (core[3] - core[1]))) if ART_MARGIN > 0 else placed)
    paint = ndi.binary_erosion(visor, iterations=RIM)
    if zone == 'mouth':
        yy, xx = np.mgrid[:visor.shape[0], :visor.shape[1]]
        paint &= np.hypot(yy - (mouth_xy[1] - big[1]), xx - (mouth_xy[0] - big[0])) <= ZONE * (core[3] - core[1])
    eyes = eyes_of(crop, visor)
    # 눈은 ∩ 모양이라 빛이 안쪽에도 고인다 — 덩어리를 볼록 다각형으로 감싸 안쪽까지 남긴다(03번: 눈 안쪽이 검게 파였다)
    lab, n = ndi.label(eyes)
    hulls = np.zeros(eyes.shape, bool)
    for j in range(1, n + 1): hulls |= gate.hull_mask(lab == j)
    keep = ndi.binary_dilation(hulls, iterations=EYE_GLOW) if n else eyes
    # 얼굴 앞을 지나는 큰 흰 물체(슬레이트 흰 줄 등)는 칠하지 않는다 — 열림이 흰 줄을 지워 가장자리가 깎였다(03번 113번)
    v = crop.max(2).astype(np.int32); r, b = crop[..., 0].astype(np.int32), crop[..., 2].astype(np.int32)
    white = (v >= 140) & ~((r > 170) & (r - b > 60))
    wl, wn = ndi.label(white)
    big_white = np.zeros(white.shape, bool)
    for j, sl in enumerate(ndi.find_objects(wl), 1):
        m = wl[sl] == j
        if 2 * thickness(m) >= 0.05 * (core[3] - core[1]): big_white[sl] |= m
    paint &= ~ndi.binary_dilation(big_white, iterations=7)   # 흰 줄 둘레의 가는 윤기(슬레이트 윗면 모서리)까지 — 3화소면 깎였다(03번 129번)
    return visor, paint, keep


def extend_visor(img, visor):
    """얼굴판 밖을 가장 가까운 얼굴판 화소 값으로 채운다. 중앙값으로 채우면 얼굴판 가장자리의 원래 어두운 그늘이 «어두운 골»로
    잡혀 밝게 칠해졌다(03번 검사: 아래 가장자리 쐐기 모양)."""
    _, (iy, ix) = ndi.distance_transform_edt(~visor, return_indices=True)
    return img[iy, ix]


def thin_dark(mask, mouth_xy, h):
    """어두운 입 자리 = 원화 입 자리에서 얼굴 높이의 0.3배 안, 두께(지름) 0.15배 이하인 덩어리. 넓은 얼굴판 그늘을 입으로 보고
    밝히지 않게 한다(03번: 거의 검은 얼굴판의 윤기 사이 그늘이 통째로 밝아졌다)."""
    lab, n = ndi.label(mask)
    out = np.zeros(mask.shape, bool)
    for j, sl in enumerate(ndi.find_objects(lab), 1):
        m = lab[sl] == j
        cy, cx = ndi.center_of_mass(m)
        if np.hypot(cy + sl[0].start - mouth_xy[1], cx + sl[1].start - mouth_xy[0]) > 0.3 * h: continue
        if 2 * thickness(m) > 0.15 * h: continue
        out[sl] |= m
    return out


def repaint(crop, visor, paint, keep, h, keep_smile, mouth_xy):
    work = extend_visor(crop.astype(np.float64), visor)   # 얼굴판 밖(크림색 얼굴·테두리)이 열림·닫힘에 섞이지 않게
    k = max(5, int(SIZE * h) | 1)
    opened = np.stack([ndi.grey_opening(work[..., c], size=(k, k)) for c in range(3)], -1)
    new = opened
    if not keep_smile:
        closed = np.stack([ndi.grey_closing(opened[..., c], size=(k, k)) for c in range(3)], -1)
        darkhole = thin_dark((closed.max(2) - opened.max(2)) > DARK_FILL, mouth_xy, h)
        new = np.where(darkhole[..., None], closed, opened)
    target = paint & ~keep
    # 차이를 흐리지 않는다 — 흐리면 지운 입선이 옅게 되살아났다(03번 60번 실측: 45 → 17). 칠한 곳 가장자리만 부드럽게 섞는다
    delta = (new - crop) * target[..., None]
    wgt = np.clip(ndi.gaussian_filter(target.astype(np.float64), FEATHER), 0, 1) * paint
    out = crop + delta * np.where(target, 1.0, wgt)[..., None]
    return np.clip(out.round(), 0, 255).astype(np.uint8)


def check_frame(crop, visor, paint, keep, h, keep_smile, mouth_xy):
    v = extend_visor(crop.astype(np.float64), visor).max(2)
    local = ndi.median_filter(v, size=31)
    bright = paint & ~keep & (v - local >= BRIGHT_C) & (v >= BRIGHT_V)
    nb = int(bright.sum())
    nd = 0
    if not keep_smile:
        k = max(5, int(DARK_K * h) | 1)
        closed = ndi.grey_closing(v, size=(k, k))
        dark = thin_dark(paint & ~keep & ((closed - v) >= DARK_C), mouth_xy, h)
        lab, n = ndi.label(dark)
        nd = int(sum(s for s in ndi.sum(dark, lab, range(1, n + 1)) if s >= 8)) if n else 0
    return nb, nd


def frames_spec(spec, n):
    if not spec: return set(range(1, n + 1))
    return {x for part in spec.split(',') for x in range(int(part.split('-')[0]), int(part.split('-')[-1]) + 1)}


def run_check(files, regions, faces, zone, keep_smile, inject=None):
    rows, outline, masks = [], [], {}
    for i, (rgb, items) in enumerate(track_boxes(files, regions, faces), 1):
        if inject: rgb = inject(i, rgb, items)
        for fi, b, mxy, sc in items:
            big, core = gate.expand(b, rgb.shape)
            crop = rgb[big[1]:big[3], big[0]:big[2]]
            z = zones(crop, big, core, mxy, zone, fi, b, sc)
            if z is None: continue
            visor, paint, keep = z
            nb, nd = check_frame(crop, visor, paint, keep, core[3] - core[1], keep_smile, (mxy[0] - big[0], mxy[1] - big[1]))
            if nb >= BRIGHT_N or nd >= DARK_N: rows.append({'frame': i, 'face': fi + 1, 'bright': nb, 'dark': nd})
            full = np.zeros(rgb.shape[:2], bool); full[big[1]:big[3], big[0]:big[2]] = visor
            masks.setdefault(fi, []).append((i, full, b))
    # ② 윤곽: 프레임 t가 앞(t-1)과도 뒤(t+1)와도 다르면(둘 중 작은 값) 순간적으로 무너졌다 돌아온 것이다. 고개를 돌리는 움직임은
    #    앞뒤 한쪽과는 비슷해서 걸리지 않는다. 값 = 두 윤곽의 다른 넓이 ÷ 둘레(평균 몇 화소 어긋났나), 추적한 상자 이동만큼 맞춘 뒤 잰다
    def diff(m1, b1, m2, b2):
        sh = np.roll(np.roll(m1, b2[1] - b1[1], 0), b2[0] - b1[0], 1)
        return float((m2 ^ sh).sum() / max(1, (m2 & ~ndi.binary_erosion(m2)).sum()))
    flagged_outline = []
    for fi, seq in masks.items():
        vals = []
        for k in range(1, len(seq) - 1):
            (i0, m0, b0), (i1, m1, b1), (i2, m2, b2) = seq[k - 1], seq[k], seq[k + 1]
            if i1 - i0 != 1 or i2 - i1 != 1: continue
            vals.append({'frame': i1, 'face': fi + 1, 'px': round(min(diff(m0, b0, m1, b1), diff(m2, b2, m1, b1)), 3)})
        outline += vals
        med = float(np.median([o['px'] for o in vals])) if vals else 0
        flagged_outline += [o for o in vals if o['px'] > max(OUTLINE_PX, OUTLINE_X * med)]
    return rows, flagged_outline, outline


def runs(nums):
    out = []
    for n in sorted(set(nums)):
        if out and n == out[-1][1] + 1: out[-1][1] = n
        else: out.append([n, n])
    return ' '.join(f'{a}~{b}번({(a - 1) / 24:.2f}~{(b - 1) / 24:.2f}초)' for a, b in out)


def main():
    global SCENE
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('out', nargs='?')
    ap.add_argument('--frames', default=''); ap.add_argument('--faces', default=''); ap.add_argument('--zone', default='mouth', choices=['mouth', 'full'])
    ap.add_argument('--keep-smile', action='store_true'); ap.add_argument('--compare'); ap.add_argument('--check', action='store_true')
    ap.add_argument('--json'); ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    SCENE = a.scene.zfill(2)
    regions = REGIONS[:] = load_regions(SCENE)
    faces = [int(x) - 1 for x in a.faces.split(',')] if a.faces else list(range(len(regions)))
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2

    if a.check or a.selftest:
        inject = None
        if a.selftest:
            def inject(i, rgb, items):            # 10·20·30번 프레임에 가짜 흰 입·어두운 미소선·테두리 홈을 그린다
                if i not in (10, 20, 30): return rgb
                im = Image.fromarray(rgb.copy()); d = ImageDraw.Draw(im)
                fi, b, (mx, my), _ = items[0]; h = b[3] - b[1]
                if i == 10: d.arc([mx - 0.2 * h, my - 0.15 * h, mx + 0.2 * h, my + 0.1 * h], 20, 160, fill=(245, 245, 245), width=4)
                if i == 20: d.arc([mx - 0.2 * h, my - 0.15 * h, mx + 0.2 * h, my + 0.1 * h], 20, 160, fill=(0, 0, 0), width=6)
                if i == 30: d.ellipse([b[0] + 0.35 * (b[2] - b[0]), b[3] - 0.12 * h, b[0] + 0.65 * (b[2] - b[0]), b[3] + 0.12 * h], fill=(230, 215, 200))
                return np.asarray(im)
        rows, bad_outline, _ = run_check(files, regions, faces, a.zone, a.keep_smile, inject)
        if a.json: json.dump({'mouth': rows, 'outline': bad_outline}, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
        print(f'{SCENE}: {len(files)}프레임 · ① 입(눈 아닌 밝은 것·어두운 선) {len({r["frame"] for r in rows})}프레임 {runs([r["frame"] for r in rows])}'
              f' · ② 얼굴선 무너짐 {len({o["frame"] for o in bad_outline})}프레임 {runs([o["frame"] for o in bad_outline])}')
        if a.selftest:
            got = {'흰 입(10)': any(r['frame'] == 10 and r['bright'] >= BRIGHT_N for r in rows),
                   '어두운 미소선(20)': any(r['frame'] == 20 and r['dark'] >= DARK_N for r in rows),
                   '테두리 홈(30)': any(o['frame'] in (30, 31) for o in bad_outline)}
            for k, ok in got.items(): print(f'자기검사 · {k}: {"걸림" if ok else "놓침"}')
            return 0 if all(got.values()) else 1
        return 1 if rows or bad_outline else 0

    if not a.out: ap.error('출력 폴더가 필요하다')
    os.makedirs(a.out, exist_ok=True)
    todo = frames_spec(a.frames, len(files)); fixed = []
    for i, (rgb, items) in enumerate(track_boxes(files, regions, faces), 1):
        name = os.path.basename(files[i - 1])
        if i not in todo: shutil.copyfile(files[i - 1], os.path.join(a.out, name)); continue
        out = rgb.copy()
        for fi, b, mxy, sc in items:
            big, core = gate.expand(b, rgb.shape)
            crop = out[big[1]:big[3], big[0]:big[2]]
            z = zones(crop, big, core, mxy, a.zone, fi, b, sc)
            if z is None: continue
            visor, paint, keep = z
            out[big[1]:big[3], big[0]:big[2]] = repaint(crop, visor, paint, keep, core[3] - core[1], a.keep_smile, (mxy[0] - big[0], mxy[1] - big[1]))
        Image.fromarray(out).save(os.path.join(a.out, name)); fixed.append(i)
        if a.compare:
            os.makedirs(a.compare, exist_ok=True)
            b = items[0][1]; pad = 20
            box = (max(0, b[0] - pad), max(0, b[1] - pad), min(rgb.shape[1], b[2] + pad), min(rgb.shape[0], b[3] + pad))
            Image.fromarray(rgb).crop(box).save(os.path.join(a.compare, f'{i:03d}-before.png'))
            Image.fromarray(out).crop(box).save(os.path.join(a.compare, f'{i:03d}-after.png'))
    print(f'{SCENE}: {len(files)}장 · 다시 칠한 프레임 {len(fixed)}')


if __name__ == '__main__':
    sys.exit(main())

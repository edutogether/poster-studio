"""Poster Studio 대기 영상 얼굴 보정(2026-10-08 방식): 얼굴판 안에서 주황 눈 두 개만 남기고, 입 자리를 얼굴판 자체의 검정·윤기로 다시 칠한다.

왜: 입 화소를 하나하나 찾아 지우고 둘레로 메우던 방식(remove-face-marks.py)은 입이 얼굴판 가장자리에 닿거나 김·반사광과 겹치면
얼굴선을 무너뜨렸다(Bumm님 판정 4·10번). 그리고 입을 «찾는» 방식이라 덜 밝거나 어두운 입은 놓쳤다(3·7·9번 «입 안 지워짐»).
그래서 «무엇이 입인가»를 찾지 않고 «무엇을 남기는가»(눈 두 개)만 정한다. Bumm님 기준(2026-10-08): 원화의 어두운 미소선도 입으로 보고 지운다
(--keep-smile이면 어두운 미소선은 남긴다). 08번은 원화 입을 그대로 두므로 이 도구를 쓰지 않는다.

방법(얼굴마다, 두 번 훑는다)
  1차. 얼굴 상자를 앞 프레임에서 따라가고(check-face-elements.py와 같은 추적), 원화 얼굴판 모양을 지금 얼굴판에 맞춘다(기울기·가로·세로 크기·
       위치를 앞 프레임 값에서 조금씩 바꿔 겹침이 가장 큰 값). 고개를 돌리면 얼굴판이 좁아지고 입 자리도 옮겨 가므로 원화 모양을 그대로
       얹으면 어긋났다(07번: 겹침 0.2까지 떨어져 입이 칠하는 곳 밖에 남았다). 눈 모양은 원화 좌표로 바꿔 모아 둔다.
  2차. 얼굴판 = (상자와 가장 많이 겹치는 어두운 덩어리 ∪ 원화 눈 자리의 주황 덩어리, 구멍 메움) ∩ 맞춘 원화 모양(2화소 여유) — 얼굴 앞을
       지나는 소품(슬레이트 검은 줄, 손가락)이 얼굴판과 이어져도 원화 모양 밖은 칠하지 않는다.
       칠하는 곳 = 얼굴판을 RIM화소 안으로 줄인 영역 ∩ 맞춘 원화 입 자리 둘레(얼굴 높이의 ZONE배, --zone full이면 얼굴판 전체).
       얼굴판 가장자리(테두리)는 건드리지 않는다.
       남기는 것 = 맞춘 원화 두 눈 자리 가까이의 주황 덩어리 전부(눈 하나가 점 두 개로 갈라져도 함께)를 눈마다 볼록 다각형으로 감싸고,
       앞뒤 BLINK_WIN프레임의 눈 모양을 합친 것 + 빛 번짐(EYE_GLOW화소). 눈을 감는 동안 드러나는 눈 둘레 둥근 껍질까지 남긴다.
       칠하는 곳 안에서 얼굴판의 매끈한 바탕(회색조 열림, 얼굴 높이의 SIZE배)보다 튀게 밝은 것과 닫힘보다 어두운 가는 것(입·미소선)을
       찾아 둘레 2화소까지, 그리고 입 자리 둘레 타원(MOUTH_CORE)은 통째로, 둘레의 원래 얼굴판 화소로 라플라스 보간해 메운다.
       바뀌지 않은 곳은 원래 화소 그대로라 윤기·명암이 남는다. 옆얼굴(맞춘 가로 배율 NARROW 미만)은 입 자리 둘레의 자국만 메운다.
검사(--check, 보정 결과에 돌린다. --source에 보정 전 프레임을 주면 ②를 가르고 ③④를 더 본다)
  ① 칠하는 곳 안에 눈이 아닌 밝은 화소·어두운 선이 없을 것. 얼굴 앞을 가린 소품 둘레(OCC_BAND화소)에서 걸린 것은 «사람 확인»으로 따로 낸다.
  ② 얼굴판 윤곽이 앞뒤 프레임과 갑자기 달라지지 않을 것(얼굴선 무너짐). 보정 전에도 같은 프레임이 걸리면 영상 자체의 움직임이라 «사람 확인».
  ③ 칠하는 곳 밖은 한 화소도 바뀌지 않았을 것(얼굴선·테두리를 건드리지 않았다는 증거).
  ④ 눈이 지워지지 않았을 것(얼굴판 안 주황 화소가 보정 전보다 10% 넘게 줄면 실패).
  원화 얼굴판을 맞추지 못한 프레임(겹침 FIT_MIN 미만)은 칠하지 않고 «사람 확인»으로 낸다.
  --selftest는 가짜 흰 입·어두운 미소선·테두리 홈·지운 눈을 그려 넣어 넷 다 걸리는지 본다. 자기검사는 «보정한 결과»에 --source와 함께
  돌린다 — 보정 전 프레임에는 원화 미소선이 이미 있어서, 그 옆에 가짜 선을 그리면 둘이 한 굵은 띠가 되어 «가는 선»이 아니게 된다.
종료코드: 0 통과 · 1 실패 · 3 실패는 없고 «사람 확인»만 있음 · 2 대상 없음
사용: python scripts/media/repaint-visor.py <장면> <원본 프레임> <출력 폴더> [--frames 1-192] [--faces 1,2] [--zone mouth|full] [--keep-smile] [--compare 폴더]
      python scripts/media/repaint-visor.py <장면> <보정한 프레임 폴더> --check [--source 보정 전 폴더] [--json 결과.json] [--keep-smile]
      python scripts/media/repaint-visor.py <장면> <보정한 프레임 폴더> --selftest --source <보정 전 폴더>
"""
import argparse, glob, importlib.util, json, math, os, shutil, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('gate', os.path.join(HERE, 'check-face-elements.py'))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
spec = importlib.util.spec_from_file_location('fix', os.path.join(HERE, 'remove-face-marks.py'))
fix = importlib.util.module_from_spec(spec); spec.loader.exec_module(fix)

RIM = 4            # 얼굴판 가장자리에서 이만큼 안쪽만 칠한다
ZONE = 0.45        # 원화 입 자리에서 얼굴 상자 높이의 이 배수 안을 칠한다(--zone mouth)
SIZE = 0.2         # 열림·닫힘 크기 = 얼굴 상자 높이의 이 배수(입선·미소선·벌린 입보다 크고 넓은 윤기보다 작게)
DARK_FILL = 6      # 닫힘이 원래보다 이만큼 넘게 밝으면 어두운 입 자리로 보고 메운다
MIN_EYE = 0.3      # (원화 눈 자리에서 하나도 못 찾을 때) 눈 = 가장 큰 주황 덩어리의 이 배수 이상인 덩어리(최대 2개)
EYE_NEAR = 0.35    # 맞춘 원화 눈 자리에서 얼굴 높이의 이 배수 안에 무게중심이 있는 주황 덩어리는 모두 눈이다 — «가장 큰 둘»만 남기면
                   # 눈을 감을 때 한 눈이 점 두 개로 갈라져 나머지 점이 지워졌다(03번 12·15번 실측). 0.2배로는 눈을 감은 점이 ∩ 끝에 있어
                   # 원화 눈 무게중심(∩ 가운데)에서 멀어 빠졌다(03번 15번 실측). 0.28배로도 고개를 돌린 채 눈을 감으면 안쪽 점이 빠졌다(03번 102번)
EYE_GLOW = 9       # 눈 둘레 빛 번짐 — 칠하지 않는다
BLINK_WIN = 8      # 앞뒤 이만큼 프레임의 눈 모양을 합쳐 남긴다 — 눈을 감는 동안 드러나는 둥근 눈 껍질이 칠하는 곳 경계에 잘려
                   # 각진 검은 자국이 남았다(03번 12·15번 실측)
MARK_BRIGHT = 12   # 열림(얼굴판의 매끈한 바탕)보다 이만큼 넘게 밝으면 바꿀 자국
MOUTH_CORE = (0.36, 0.16)   # 입 자리 둘레 타원(맞춘 기울기·배율을 따름, 얼굴 높이의 가로·세로 반지름 배수)은 자국을 찾지 않고 통째로 메운다 —
                            # 자국만 찾아 메우면 원화 미소선의 어두운 몸통이 옅게 남아 밝기를 올리면 입 모양이 보였다(03번 4~6번 실측)
NARROW = 0.65      # 맞춘 가로 배율이 이보다 작으면(옆얼굴) 얼굴판 전체를 다시 칠하지 않고 눈에 띄는 자국 둘레만 칠한다 — 좁은 얼굴판을
                   # 통째로 열림으로 칠하면 가장자리 윤기가 지워져 각진 얼룩이 생겼다(07번 64번 실측)
PLATE_MARGIN = 0.0    # 얼굴판 = 어두운 덩어리 ∩ 맞춘 원화 모양을 얼굴 높이의 이 배만큼 넓힌 것(--plate-margin). 기본 0(2화소).
                      # 07번은 0.08 — 고개를 돌리는 동안 맞춤이 덜 맞아 가장자리 미소선이 얼굴판 밖이 되었다(118번). 얼굴 앞을 소품이
                      # 지나가는 장면(03번 슬레이트·손가락)에서는 넓히면 소품의 검은 줄·손가락 틈이 얼굴판에 이어져 번졌다(110·113번) —
                      # 소품을 색으로 가르면 손가락(크림색)과 머리 껍데기를 가를 수 없어, 장면마다 확인하고 켠다
FIT_MIN = 0.5      # 맞춘 원화 얼굴판과 지금 얼굴판의 겹침(교집합÷합집합)이 이보다 낮으면 칠하지 않고 «사람 확인»
FIT_LIMITS = [(-35.0, 35.0), (0.25, 1.3), (0.7, 1.3)]   # 기울기(도)·가로 배율(옆얼굴까지)·세로 배율
PROP_DEPTH = 0.1   # 얼굴판 밖에서 들어온 밝은 덩어리가 얼굴판 가장자리에서 얼굴 높이의 이 배 넘게 들어오면 소품
PROP_AREA = 0.04   # 얼굴판 볼록 다각형 깊이(6화소 안) 들어온 어둡지 않은 덩어리가 얼굴 높이 제곱의 이 배 이상이면 얼굴 앞의 소품
OCC_THICK, OCC_BAND = 0.04, 8                 # 얼굴판을 가린 소품 = 원화 모양 안의 얼굴판 아닌 덩어리 중 두께가 얼굴 높이의 0.04배 이상인 것
# 검사 기준
RIM_GLOSS = 0.06                              # ① 얼굴판 가장자리 윤기 띠의 깊이(얼굴 높이의 배수)
BRIGHT_C, BRIGHT_V, BRIGHT_N = 35, 90, 15     # ① 둘레보다 35 넘게 밝고 90 이상인 화소가 15개 이상이면 «눈 아닌 밝은 것»
DARK_C, DARK_N, DARK_K = 20, 60, 0.1         # ① 닫힘(얼굴 높이의 0.1배)보다 10 넘게 어두운 화소가 25개 이상이면 «어두운 선(미소선·입)».
                                              #   닫힘을 칠할 때처럼 0.2배로 크게 잡으면 얼굴판의 넓은 그늘까지 미소선과 한 덩어리로 잡혀
                                              #   «두꺼운 그늘»로 빠졌다(자기검사 20번 실측: 1924화소 한 덩어리).
                                              #   차이 기준 20(07번 실측: 고치기 전 미소선 157~258화소, 고친 뒤 0~9화소 — 10이면 고친 뒤에도
                                              #   얼굴판 윤기 사이 그늘이 14~63화소 잡혔다). 화소 수 기준 60: 고친 뒤 최대 27화소(07번 164번,
                                              #   2.5배 밝기로 봐도 선이 없음), 고치기 전 최소 157화소, 자기검사 가짜 미소선 약 300화소
OUTLINE_PX, OUTLINE_X = 0.6, 3.0              # ② 앞뒤 둘 다와 다른 정도(화소)가 0.6 넘고 그 장면 중앙값의 3배 넘으면 «얼굴선 무너짐»
EYE_LOSS = 0.1                                # ④ 얼굴판 안 주황 화소가 보정 전보다 이 비율 넘게 줄면 «눈 지워짐»

ART = {}
REGIONS = []


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


def thickness(m):
    """덩어리의 반두께(가장 깊은 안쪽 화소에서 가장자리까지). 덩어리 상자로 잘라 재므로 둘레를 1화소 비워야 한다 — 비우지 않으면
    상자 끝에 닿은 가는 선(호의 양 끝)이 상자 밖을 덩어리로 보고 두껍게 재져, 가는 흰 입이 «큰 흰 물체»로 빠졌다(자기검사 10번 실측)."""
    return ndi.distance_transform_edt(np.pad(m, 1)).max()


def warm_of(crop, visor):
    r, g, b = (crop[..., k].astype(np.int32) for k in range(3))
    hue = (g - b) / np.maximum(r - b, 1)
    # 얼굴판을 볼록 다각형으로 감싼 곳 안만 본다 — 얼굴판 가장자리에 닿은 눈은 빛 번짐이 크림색 테두리와 이어져 어두운 덩어리에서
    # 3화소 넘게 떨어졌고, 그래서 원화에서조차 눈이 하나만 잡혔다(07번 원화 실측)
    return (r > 170) & (r - b > 60) & (hue >= 0.2) & ndi.binary_dilation(gate.hull_mask(visor), iterations=3)


def top_eyes(crop, visor):
    """가장 큰 주황 덩어리 둘(가장 큰 것의 MIN_EYE배 이상)과 그 가까이의 조각. 원화의 눈 자리를 잡을 때, 그리고 원화 눈 자리에서 하나도
    못 찾을 때 쓴다. 멀리 떨어진 주황(11번 엄마 얼굴판에 비친 아들 눈)은 남기지 않는다."""
    warm = warm_of(crop, visor)
    lab, n = ndi.label(warm)
    if not n: return np.zeros(visor.shape, bool)
    sizes = ndi.sum(warm, lab, range(1, n + 1)); order = np.argsort(-sizes)
    keep = [1 + j for j in order[:2] if sizes[j] >= MIN_EYE * sizes[order[0]]]
    main = np.isin(lab, keep)
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
        yield rgb, [(fi, list(b), s) for fi, b in zip(faces, boxes)]


def art_ref(fi, scale):
    """원화(영상 크기로 줄인 것)의 얼굴판 모양·무게중심·입 자리·두 눈 자리. 좌표는 원화 전체 그림 기준(x, y)."""
    if fi not in ART:
        img = Image.open(os.path.join(gate.ART_DIR, f'{SCENE}.png')).convert('RGB')
        art = np.asarray(img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS))
        box = [int(round(c * scale)) for c in REGIONS[fi]['face']]
        big, core = gate.expand(box, art.shape)
        crop = art[big[1]:big[3], big[0]:big[2]]
        m = visor_of(crop, core)
        e = top_eyes(crop, m); lab, n = ndi.label(e); sizes = ndi.sum(e, lab, range(1, n + 1))
        m = ndi.binary_fill_holes(m | (ndi.binary_dilation(e, iterations=EYE_GLOW) & gate.hull_mask(m)))   # 가장자리에 닿은 눈도 얼굴판이다(plate_of와 같은 기준)
        cents = ndi.center_of_mass(e, lab, [1 + int(j) for j in np.argsort(-sizes)[:2]])
        cy, cx = ndi.center_of_mass(m)
        ART[fi] = {'mask': m.astype(np.uint8), 'org': (big[0], big[1]), 'c': np.array([cx + big[0], cy + big[1]]), 'box': box,
                   'mouth': np.array([REGIONS[fi]['mouth'][0] * scale, REGIONS[fi]['mouth'][1] * scale]),
                   'eyes': np.array([[x + big[0], y + big[1]] for y, x in cents])}
    return ART[fi]


def mat(p):
    th = math.radians(p[0]); c, s = math.cos(th), math.sin(th)
    return np.array([[c, -s], [s, c]]) @ np.diag([p[1], p[2]])


def fwd(p, ref, pts):
    """원화 좌표(x, y) → 영상 좌표. p = [기울기, 가로 배율, 세로 배율, 무게중심 x, 무게중심 y]"""
    return (np.asarray(pts, float).reshape(-1, 2) - ref['c']) @ mat(p).T + np.array(p[3:5])


def inv(p, ref, pts):
    return (np.asarray(pts, float).reshape(-1, 2) - np.array(p[3:5])) @ np.linalg.inv(mat(p)).T + ref['c']


def render(p, ref, shape, org, step=1):
    """맞춘 원화 얼굴판을 잘라낸 곳(왼쪽 위 org) 크기로 그린다. step배로 줄여 그릴 수 있다(맞출 때 빠르게)."""
    a, b, c2, d = np.linalg.inv(mat(p)).ravel()
    bx0, by0 = org; tx, ty = p[3], p[4]; cax, cay = ref['c']; ax0, ay0 = ref['org']
    matrix = np.array([[d, c2], [b, a]]) * step
    off = [c2 * (bx0 - tx) + d * (by0 - ty) + cay - ay0, a * (bx0 - tx) + b * (by0 - ty) + cax - ax0]
    return ndi.affine_transform(ref['mask'], matrix, offset=off, output_shape=shape, order=0) > 0


def fit(raw, org, ref, p0):
    """원화 얼굴판을 지금 얼굴판(raw)에 맞춘다: 앞 프레임 값에서 다섯 값을 하나씩 늘리고 줄여 겹침이 커지면 받아들이고, 더 안 커지면
    보폭을 줄인다. 반으로 줄인 그림에서 잰다."""
    ds = raw[::2, ::2]
    def iou(p):
        t = render(p, ref, ds.shape, org, 2); u = (t | ds).sum()
        return (t & ds).sum() / u if u else 0.0
    p = list(p0); best = iou(p)
    steps, mins = [3.0, 0.06, 0.04, 3.0, 3.0], [0.25, 0.005, 0.004, 0.25, 0.25]
    for _ in range(120):
        moved = False
        for k in range(5):
            for sgn in (1, -1):
                q = p.copy(); q[k] += sgn * steps[k]
                if k < 3: q[k] = min(max(q[k], FIT_LIMITS[k][0]), FIT_LIMITS[k][1])
                v = iou(q)
                if v > best + 1e-4: p, best, moved = q, v, True; break
        if not moved:
            if all(s <= m for s, m in zip(steps, mins)): break
            steps = [max(s / 2, m) for s, m in zip(steps, mins)]
    return p, best


def disk(r):
    yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
    return yy * yy + xx * xx <= r * r


def plate_of(crop, raw, placed, centers, h, mouth):
    """얼굴판 = 어두운 덩어리 ∪ 원화 눈 자리 가까이의 주황 덩어리(구멍 메움) ∩ 맞춘 원화 모양(2화소 여유). 고개를 돌리면 눈이 얼굴판
    가장자리에 닿아 어두운 덩어리에서 빠졌고, 그 자리를 «얼굴판 밖»으로 보고 둘레 값을 늘려 채우다 보니 눈 옆 미소선이 그 빈자리로
    번져 굵어져 메워지지 않았다(07번 1·5번 실측)."""
    warm = warm_of(crop, raw)
    lab, n = ndi.label(warm)
    eyes = np.zeros(raw.shape, bool)
    if n:
        cents = ndi.center_of_mass(warm, lab, range(1, n + 1))
        inside = ndi.sum(gate.hull_mask(raw & ndi.binary_dilation(placed, iterations=2)), lab, range(1, n + 1)) / np.maximum(ndi.sum(warm, lab, range(1, n + 1)), 1)
        eyes = np.isin(lab, [j for j, (cy, cx) in enumerate(cents, 1) if inside[j - 1] >= 0.5
                             and min(math.hypot(cx - ax, cy - ay) for ax, ay in centers) <= EYE_NEAR * h])
    # 눈 둘레 빛 번짐(EYE_GLOW)까지 넣는다 — 눈만 넣으면 빛 번짐 고리가 얼굴판 밖으로 남아 같은 일이 났다(07번 1번)
    eyes = ndi.binary_dilation(eyes, iterations=EYE_GLOW) if eyes.any() else eyes
    # 닫아 메운다 — 입끝이 얼굴판 가장자리에 닿으면 구멍이 아니라 «밖»이 되어 칠하지 못했다(07번 58~62번 실측: 옆얼굴에서 흰 입끝이 남음).
    # 입 자리 둘레(얼굴 높이의 0.3배)만 반지름 5로 크게 닫는다 — 얼굴판 윤곽은 볼록해서 닫아도 늘지 않고, 입이 만든 홈만 메워진다
    base = raw | eyes
    yy, xx = np.mgrid[:raw.shape[0], :raw.shape[1]]
    near = np.hypot(yy - mouth[1], xx - mouth[0]) <= 0.3 * h
    closed = ndi.binary_closing(base, iterations=2) | (ndi.binary_closing(np.pad(base, 6), structure=disk(5))[6:-6, 6:-6] & near)
    # 옆얼굴에서는 입이 머리 윤곽 끝(흰 바탕과 맞닿은 곳)에 걸려 닫기로도 구멍이 되지 않았다(07번 60·62번). 얼굴판은 볼록하므로
    # 입 자리 둘레에서는 볼록 다각형까지 얼굴판으로 본다(원화 모양 안만)
    closed |= gate.hull_mask(base) & near & ndi.binary_dilation(placed, iterations=max(2, int(PLATE_MARGIN * h)))
    filled = ndi.binary_fill_holes(closed)
    # 맞춘 원화 모양에서 2화소(장면 설정 PLATE_MARGIN이 있으면 얼굴 높이의 그 배)까지 얼굴판으로 본다 — 까닭은 PLATE_MARGIN 주석
    within = ndi.binary_dilation(placed, iterations=max(2, int(PLATE_MARGIN * h)))
    return filled & within, filled & ~base & within & near


def eye_hull(crop, visor, centers, h, raw):
    """맞춘 원화 두 눈 자리마다, 그 가까이(EYE_NEAR)에 무게중심이 있는 주황 덩어리를 모아 볼록 다각형으로 감싼다. 눈은 ∩ 모양이라
    빛이 안쪽에도 고인다(03번: 덩어리만 남기면 눈 안쪽이 검게 파였다)."""
    warm = warm_of(crop, visor)
    lab, n = ndi.label(warm)
    out = np.zeros(visor.shape, bool)
    if not n: return out
    cents = ndi.center_of_mass(warm, lab, range(1, n + 1))
    # 얼굴판 볼록 다각형 밖에 절반 넘게 있는 주황(머리 옆 금색 귀 고리 등)은 눈이 아니다 — 눈 가까이에 있으면 눈 무리에 들어가 가장 큰
    # 덩어리가 되어, 눈 감을 때의 작은 점들이 «작은 조각»으로 빠져 지워졌다(03번 15·102번 실측)
    # 어두운 얼굴판 덩어리(raw)를 맞춘 원화 모양으로 자른 것의 볼록 다각형으로 잰다 — 눈을 넣은 얼굴판으로 재면 귀 고리가 눈으로
    # 들어간 뒤라 소용없었고, 자르지 않은 raw는 검은 귀 원판까지 이어져 그 위의 금색 고리가 안쪽으로 잡혔다(03번 15번)
    inside = ndi.sum(gate.hull_mask(raw), lab, range(1, n + 1)) / np.maximum(ndi.sum(warm, lab, range(1, n + 1)), 1)
    groups = [[] for _ in centers]
    for j, (cy, cx) in enumerate(cents, 1):
        if inside[j - 1] < 0.5: continue
        d = [math.hypot(cx - ax, cy - ay) for ax, ay in centers]; k = int(np.argmin(d))
        if d[k] <= EYE_NEAR * h: groups[k].append(j)
    if not any(groups):
        e = top_eyes(crop, visor); l2, n2 = ndi.label(e)
        for j in range(1, n2 + 1): out |= gate.hull_mask(l2 == j)
        return out
    # 눈마다 가장 큰 덩어리의 0.15배(최소 4화소) 이상인 덩어리만 감싼다 — 입 가장자리에 비친 주황 몇 화소까지 눈에 묶이면 볼록
    # 다각형이 입까지 넓어져 흰 입이 «남기는 곳»에 들었다(07번 58번 실측). 눈 감을 때 갈라진 점 둘은 크기가 비슷해 함께 남는다
    sizes = ndi.sum(warm, lab, range(1, n + 1))
    for g in groups:
        if not g: continue
        big = max(sizes[j - 1] for j in g)
        g = [j for j in g if sizes[j - 1] >= max(4, 0.15 * big)]
        out |= gate.hull_mask(np.isin(lab, g))
    return out


def follow(files, faces, inject=None):
    """1차: 프레임마다 원화 얼굴판을 맞추고 눈 모양(원화 좌표)을 모은다."""
    track, prev = {}, {}
    for i, (rgb, items) in enumerate(track_boxes(files, REGIONS, faces), 1):
        if inject: rgb = inject(i, rgb, items)
        for fi, b, sc in items:
            ref = art_ref(fi, sc)
            big, core = gate.expand(b, rgb.shape); crop = rgb[big[1]:big[3], big[0]:big[2]]; org = (big[0], big[1])
            if fi in prev:
                p0 = list(prev[fi][0]); p0[3] += b[0] - prev[fi][1][0]; p0[4] += b[1] - prev[fi][1][1]
            else:
                p0 = [0.0, 1.0, 1.0, ref['c'][0] + b[0] - ref['box'][0], ref['c'][1] + b[1] - ref['box'][1]]
            raw = visor_of(crop, core)
            if raw is None:
                prev[fi] = (p0, b); continue
            p, score = fit(raw, org, ref, p0)
            prev[fi] = (p if score >= FIT_MIN else p0, b)
            rec = {'p': p, 'iou': score, 'eyes': np.zeros((0, 2))}
            if score >= FIT_MIN:
                centers = fwd(p, ref, ref['eyes']) - org
                visor, _ = plate_of(crop, raw, render(p, ref, raw.shape, org), centers, core[3] - core[1], fwd(p, ref, ref['mouth'])[0] - org)
                hull = eye_hull(crop, visor, centers, core[3] - core[1], raw & ndi.binary_dilation(render(p, ref, raw.shape, org), iterations=2))
                rec['eyes'] = inv(p, ref, np.argwhere(hull)[:, ::-1] + org)
            track[(i, fi)] = rec
    return track


def window_keep(track, i, fi, p, ref, shape, org, win=BLINK_WIN):
    """앞뒤 win프레임의 눈 모양(원화 좌표)을 지금 프레임의 맞춘 자리로 옮겨 합친다."""
    m = np.zeros(shape, bool)
    for s in range(i - win, i + win + 1):
        rec = track.get((s, fi))
        if rec is None or not len(rec['eyes']): continue
        q = np.rint(fwd(p, ref, rec['eyes']) - org).astype(int)
        ok = (q[:, 0] >= 0) & (q[:, 0] < shape[1]) & (q[:, 1] >= 0) & (q[:, 1] < shape[0])
        m[q[ok, 1], q[ok, 0]] = True
    return ndi.binary_closing(m, iterations=1) | m


def zones(crop, org, core, ref, p, keep_hull, zone, cur_hull):
    """keep_hull = 앞뒤 프레임 눈 모양을 합친 것, cur_hull = 이 프레임의 눈 모양.
    반환: 얼굴판, 칠하는 곳, 남기는 곳, 가린 소품 둘레, 입 자리, 옆얼굴인지"""
    raw = visor_of(crop, core)
    if raw is None: return None
    placed = render(p, ref, raw.shape, org)
    h = core[3] - core[1]
    mouth = fwd(p, ref, ref['mouth'])[0] - org
    visor, holes = plate_of(crop, raw, placed, fwd(p, ref, ref['eyes']) - org, h, mouth)
    paint = ndi.binary_erosion(visor, iterations=RIM)
    # 테두리 띠 안이라도 입 자리 둘레에서 얼굴판에 둘러싸인 밝은 것(가장자리에 닿은 흰 입끝)은 칠한다. 어두운 테두리 화소와
    # 테두리의 중간 밝기 화소는 건드리지 않는다
    # 얼굴판 덩어리의 구멍으로 이미 메워진 흰 입(테두리 띠 안에 걸친 것)도 같다 — «구멍»만 보면 빠졌다(07번 60번: 입 끝 18화소가 남음)
    yy0, xx0 = np.mgrid[:visor.shape[0], :visor.shape[1]]
    rim_marks = (holes | (visor & (np.hypot(yy0 - mouth[1], xx0 - mouth[0]) <= 0.3 * h))) & ~paint & (crop.max(2) >= 150) & ~warm_of(crop, visor)
    paint |= ndi.binary_dilation(rim_marks, iterations=1) & visor
    if zone == 'mouth':
        yy, xx = np.mgrid[:visor.shape[0], :visor.shape[1]]
        paint &= np.hypot(yy - mouth[1], xx - mouth[0]) <= ZONE * h
    keep = ndi.binary_dilation(keep_hull, iterations=EYE_GLOW) if keep_hull.any() else keep_hull
    # 앞뒤 프레임 눈 모양은 이 프레임 눈 가까이(얼굴 높이의 0.15배 — 눈 감을 때 드러나는 껍질 크기)까지만 쓴다. 고개를 빨리 돌리는 동안에는
    # 앞뒤 프레임의 눈이 얼굴판 곳곳으로 번져 칠할 곳이 거의 남지 않았다(07번 58번: 칠하는 곳 4098화소 중 3566화소가 «남기는 곳»)
    if cur_hull.any(): keep &= ndi.binary_dilation(cur_hull, structure=disk(max(1, int(0.15 * h))))
    # 입 자리(mouth_area)에서는 앞뒤 프레임 눈 모양을 쓰지 않는다 — 이 프레임의 눈(둘레 EYE_GLOW)만 남긴다. 고개를 돌리는 동안 앞뒤 눈
    # 모양이 입 자리를 덮어 미소선이 «남기는 곳»에 들었다(07번 118·120번)
    keep &= ~mouth_area(keep.shape, mouth, h, p) | (ndi.binary_dilation(cur_hull, iterations=EYE_GLOW) if cur_hull.any() else cur_hull)
    # 앞뒤 프레임 눈 모양을 합친 «남기는 곳»에 이 프레임의 흰 입끝이 걸리면 그것은 남기지 않는다(07번 52번: 오른눈 옆 흰 입끝이 남음).
    # 이 프레임의 눈 둘레(3화소)는 눈 가운데 흰빛이라 그대로 둔다
    c = crop.astype(np.int32); vv = c.max(2); sat = (vv - c.min(2)) / np.maximum(vv, 1)
    # 흰 입의 옅은 가장자리(밝기 100 이상)까지 — 150 이상만 빼면 입 끝 둘레의 회색 점이 남았다(07번 56·58번 실측)
    # 주황 빛 둘레(3화소)에 붙은 흰 것은 눈 점의 흰 심이다 — 이 프레임 눈 모양에서 빠진 눈 점까지 «흰 입 끝»으로 보고 지웠다(03번 12·102·138번)
    stray = keep & ~ndi.binary_dilation(cur_hull, iterations=3) & (vv >= 100) & (sat < 0.35) & ~ndi.binary_dilation(warm_of(crop, visor), iterations=3)
    if stray.any(): keep = keep & ~ndi.binary_dilation(stray, iterations=2)
    # 이 프레임의 눈 모양 추적에서 빠진 눈 점이 있어도 지우지 않게, 원화 눈 자리 가까이(얼굴 높이의 0.45배)의 얼굴판 안 주황 덩어리
    # (6화소 이상)는 둘레 3화소와 함께 늘 남긴다 — 고개를 돌린 채 눈 감을 때 안쪽 점이 빠져 가운데가 검게 칠해졌다(03번 12·102번)
    warm = warm_of(crop, visor); wl2, wn2 = ndi.label(warm)
    if wn2:
        centers = fwd(p, ref, ref['eyes']) - org
        hull_raw = gate.hull_mask(raw & ndi.binary_dilation(placed, iterations=2))
        sz = ndi.sum(warm, wl2, range(1, wn2 + 1)); ins = ndi.sum(hull_raw, wl2, range(1, wn2 + 1)) / np.maximum(sz, 1)
        cs = ndi.center_of_mass(warm, wl2, range(1, wn2 + 1))
        ok = [j for j, (cy, cx) in enumerate(cs, 1) if sz[j - 1] >= 6 and ins[j - 1] >= 0.5
              and min(math.hypot(cx - ax, cy - ay) for ax, ay in centers) <= 0.45 * h]
        if ok:
            okm = np.isin(wl2, ok); keep = keep | ndi.binary_dilation(okm, iterations=3)
        # 눈을 감을 때의 눈 점은 거의 흰 덩어리이고 주황은 가장자리에 1~3화소짜리로 흩어져 있어 위 덩어리로 잡히지 않는다(03번 12번:
        # 145화소 흰 덩어리의 심이 검게 칠해졌다). 원화 눈 자리 가까이(0.45배)에서 둘레의 20% 이상이 주황에 2화소 안으로 닿은
        # 작은(얼굴 높이 제곱의 0.02배 이하) 밝은 덩어리는 눈 점으로 남긴다. 흰 입은 주황에 거의 닿지 않아 남지 않는다
        bl, bn = ndi.label((crop.max(2) >= 100) & visor)
        near_w = ndi.binary_dilation(warm, iterations=2)
        for j, sl in enumerate(ndi.find_objects(bl), 1):
            m = bl[sl] == j
            if m.sum() > 0.02 * h * h: continue
            per = m & ~ndi.binary_erosion(m)
            if (per & near_w[sl]).sum() < 0.2 * per.sum(): continue
            cy, cx = ndi.center_of_mass(m)
            if min(math.hypot(cx + sl[1].start - ax, cy + sl[0].start - ay) for ax, ay in centers) > 0.45 * h: continue
            mm = np.zeros(keep.shape, bool); mm[sl] = m; keep |= ndi.binary_dilation(mm, iterations=2)
    # 얼굴 앞을 지나는 큰 흰 물체(슬레이트 흰 줄 등)는 칠하지 않는다 — 열림이 흰 줄을 지워 가장자리가 깎였다(03번 113번)
    v = crop.max(2).astype(np.int32); r, b = crop[..., 0].astype(np.int32), crop[..., 2].astype(np.int32)
    white = (v >= 140) & ~((r > 170) & (r - b > 60))
    wl, _ = ndi.label(white)
    big_white = np.zeros(white.shape, bool)
    # 얼굴판 안에 갇힌 흰 덩어리(크게 벌린 흰 입)는 소품이 아니라 지울 자국이다 — 두께만 보면 벌린 입도 «큰 흰 물체»로 빠져
    # 그대로 남았다(01번 151~171번 실측). 소품(슬레이트 흰 줄·손가락 마디)은 얼굴판 가장자리를 넘어 밖과 이어진다
    # 로봇 머리의 크림색 껍데기도 크고 하얗지만 얼굴판 둘레를 감싼 것이지 얼굴 앞을 가린 것이 아니다 — 이것까지 넣으면 얼굴판 가장자리
    # 7화소를 통째로 칠하지 않아 가장자리에 닿은 입이 남았고, 검사에서는 가장자리 전체가 «가림 둘레»가 되었다(12번: 114프레임).
    # 그래서 얼굴판을 감싼 볼록 다각형 안쪽(3화소 안)까지 들어온 것만 소품으로 본다. 맞춘 원화 모양을 기준으로 하면 옆얼굴처럼
    # 맞춤이 덜 맞을 때 원화 모양이 머리 껍데기까지 덮어 껍데기가 소품이 되었다(07번 60번: 흰 입 끝 18화소가 칠하는 곳에서 빠짐)
    inner = ndi.binary_erosion(visor, iterations=2)
    into = ndi.binary_erosion(gate.hull_mask(visor), iterations=3)
    for j, sl in enumerate(ndi.find_objects(wl), 1):
        m = wl[sl] == j
        if 2 * thickness(m) < 0.05 * h: continue
        if not (m & ~inner[sl]).any(): continue
        if not (m & into[sl]).any(): continue
        big_white[sl] |= m
    # 흰 줄뿐 아니라 회색·검은 줄을 포함한 소품 전체(어둡지 않은 덩어리)가 얼굴판 볼록 다각형 안으로 깊이(6화소 안쪽에 얼굴 높이 제곱의
    # PROP_AREA배 이상) 들어오면 소품이다 — 입 자리 둘레를 볼록 다각형까지 얼굴판으로 넓히자 슬레이트 회색 면이 칠하는 곳에 들었다
    # (03번 110·134·140번). 입은 작아서 머리 껍데기와 이어져도 이 넓이를 넘지 않는다
    deep = ndi.binary_erosion(gate.hull_mask(visor), iterations=6)
    nl, _ = ndi.label((v >= gate.DARK) & ~((r > 170) & (r - b > 60)))
    for j, sl in enumerate(ndi.find_objects(nl), 1):
        m = nl[sl] == j
        if (m & deep[sl]).sum() >= PROP_AREA * h * h and (m & ~inner[sl]).any(): big_white[sl] |= m
    # 얼굴판 밖에서 들어와 얼굴판 가장자리로부터 얼굴 높이의 PROP_DEPTH배 넘게 깊이 들어온 밝은 덩어리(회색 슬레이트 면 등)도 소품이다 —
    # 크기·두께만 보면 흰 줄 사이 회색 면이 빠졌다(03번 110·133번). 옆얼굴에서 가장자리에 걸친 입 끝은 이만큼 깊지 않다
    depth = ndi.distance_transform_edt(visor)
    hv = gate.hull_mask(visor)
    ll, _ = ndi.label((v >= BRIGHT_V) & ~((r > 170) & (r - b > 60)) & ~big_white)
    for j, sl in enumerate(ndi.find_objects(ll), 1):
        m = ll[sl] == j
        if (m & ~hv[sl]).any() and (depth[sl][m].max() if m.any() else 0) >= PROP_DEPTH * h: big_white[sl] |= m
    # 얼굴판 구멍으로 메워진 밝은 덩어리 중 소품인 것: 크림색(손가락·손 — 흰 입은 무채색)이거나, 입 자리 타원 밖에 무게중심이 있는
    # 크고 두꺼운 것(슬레이트 흰 칸). 칠하면 소품이 얼굴판 색으로 깎였다(03번 110·113번 실측: 눈 옆 슬레이트 칸이 대각선으로 잘림)
    ml = mouth_area(visor.shape, mouth, h, p)
    pl, _ = ndi.label((v >= 140) & ~((r > 170) & (r - b > 60)) & visor & ~big_white)
    for j, sl in enumerate(ndi.find_objects(pl), 1):
        m = pl[sl] == j
        if m.sum() < 12: continue
        cream = np.median((r[sl] - b[sl])[m]) >= 18
        cy, cx = ndi.center_of_mass(m); cy, cx = int(cy) + sl[0].start, int(cx) + sl[1].start
        if cream or (not ml[cy, cx] and m.sum() >= 0.01 * h * h and 2 * thickness(m) >= 0.05 * h): big_white[sl] |= m
    paint &= ~ndi.binary_dilation(big_white, iterations=7)   # 흰 줄 둘레의 가는 윤기(슬레이트 윗면 모서리)까지 — 3화소면 깎였다(03번 129번)
    # 얼굴판을 가린 소품(검사에서만 쓴다): 원화 모양 안인데 얼굴판이 아닌 두꺼운 덩어리
    gap = placed & ~visor
    gl, _ = ndi.label(gap)
    occ = np.zeros(gap.shape, bool)
    for j, sl in enumerate(ndi.find_objects(gl), 1):
        m = gl[sl] == j
        if 2 * thickness(m) >= OCC_THICK * h: occ[sl] |= m
    occ = ndi.binary_dilation(occ, iterations=OCC_BAND) if occ.any() else occ
    # 얼굴판 앞에 든 소품·손(큰 흰 덩어리 — 손가락 마디, 슬레이트 흰 줄)의 둘레도 가림으로 본다. 칠하지 않는 7화소 밖의 검은 손가락
    # 사이 틈이 «어두운 선»으로 걸렸다(03번 115~138번 실측)
    if big_white.any(): occ |= ndi.binary_dilation(big_white, iterations=7 + OCC_BAND)
    return visor, paint, keep, occ, mouth, p[1] < NARROW


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


def repaint(crop, visor, paint, keep, h, keep_smile, mouth_xy, narrow=False, shape=None):
    """shape = 맞춘 (기울기, 가로 배율, 세로 배율) — 입 자리 타원에 쓴다"""
    work = extend_visor(crop.astype(np.float64), visor)   # 얼굴판 밖(크림색 얼굴·테두리)이 열림·닫힘에 섞이지 않게
    k = max(5, int(SIZE * h) | 1)
    if narrow: k = min(k, max(5, int(thickness(visor)) | 1))   # 좁은 옆얼굴은 얼굴판 폭의 절반까지만
    opened = np.stack([ndi.grey_opening(work[..., c], size=(k, k)) for c in range(3)], -1)
    darkhole = np.zeros(paint.shape, bool)
    if not keep_smile:
        # 어두운 가는 것은 검사와 같은 크기(DARK_K)의 닫힘으로 찾고 메운다 — 열림과 같은 크기(SIZE)로 닫으면 윤기가 강한 얼굴판에서는
        # 아래쪽 그늘 전체가 한 덩어리로 잡혀 «두꺼운 그늘»로 빠지고 미소선이 그대로 남았다(07번 1번 실측: 4306화소 한 덩어리)
        # 눈(남기는 곳)은 0으로 두고 닫는다 — 눈빛이 닫힘을 끌어올려 두 눈 사이의 원래 어두운 틈을 «어두운 선»으로 보고 밝혔다(07번 52번)
        kd = max(5, int(DARK_K * h) | 1)
        closed = np.stack([ndi.grey_closing(np.where(keep, 0, opened[..., c]), size=(kd, kd)) for c in range(3)], -1)
        d = closed.max(2) - opened.max(2)
        # 두 단계로 찾는다: 옅은 것까지(DARK_FILL) 잡으면 미소선 끝이 얼굴판 가장자리 그늘과 한 덩어리가 되어 «두꺼운 그늘»로 빠졌고,
        # 검사 기준(DARK_C)으로 한 번 더 잡으면 그 끝이 따로 잡힌다(07번 22·30번 실측: 오른눈 아래 미소선 끝이 남음)
        darkhole = thin_dark(d > DARK_FILL, mouth_xy, h) | thin_dark(d >= DARK_C, mouth_xy, h)
        # 고개를 돌리는 동안에는 앞뒤 프레임 눈 모양을 합친 «남기는 곳»이 눈 바로 아래의 미소선까지 덮어 위에서 못 찾았다(07번 118번).
        # 그래서 이 프레임의 눈빛(주황을 3화소 넓히고 ∩ 안쪽까지 닫은 것)만 0으로 두고 한 번 더 찾는다. 이렇게 찾은 것은 «남기는 곳»
        # 안이라도 칠한다(눈빛 둘레는 빼고)
        eye_now = ndi.binary_closing(ndi.binary_dilation(warm_of(crop, visor), iterations=3), iterations=4)
        closed2 = np.stack([ndi.grey_closing(np.where(eye_now, 0, opened[..., c]), size=(kd, kd)) for c in range(3)], -1)
        late = thin_dark((closed2.max(2) - opened.max(2)) >= DARK_C, mouth_xy, h) & ~eye_now
        darkhole |= late
    # 얼굴판 표면에서 튀는 것(열림보다 MARK_BRIGHT 넘게 밝은 것, 닫힘보다 어두운 가는 것)과 그 둘레 2화소만 바꾸고, 둘레의 원래 얼굴판
    # 화소로 라플라스 보간해 메운다. 칠하는 곳 전체를 열림 값으로 바꾸면 열림이 «가장 어두운 쪽»을 따라가서 입 자리가 둘레보다
    # 어두운 입 모양 그림자로 남았다(07번 58번 실측: 둘레 13~25인데 3~10으로 칠함)
    marks = ((crop.max(2).astype(np.float64) - opened.max(2)) >= MARK_BRIGHT) | darkhole
    target = paint & ~keep & ndi.binary_dilation(marks, iterations=2)
    if not keep_smile: target |= paint & ndi.binary_dilation(late, iterations=2) & ~eye_now
    if shape is not None and not narrow and not keep_smile:
        th, sx, sy = shape; c, s_ = math.cos(math.radians(th)), math.sin(math.radians(th))
        yy, xx = np.mgrid[:crop.shape[0], :crop.shape[1]]; dx, dy = xx - mouth_xy[0], yy - mouth_xy[1]
        u, w = c * dx + s_ * dy, -s_ * dx + c * dy
        target |= paint & ~keep & ((u / (MOUTH_CORE[0] * h * sx)) ** 2 + (w / (MOUTH_CORE[1] * h * sy)) ** 2 <= 1)
    if narrow:   # 옆얼굴은 입 자리 둘레(얼굴 높이의 0.3배)만 — 좁은 얼굴판 위쪽 윤기까지 자국으로 보고 칠해 얼룩이 생겼다(07번 64~70번)
        yy, xx = np.mgrid[:crop.shape[0], :crop.shape[1]]
        target &= np.hypot(yy - mouth_xy[1], xx - mouth_xy[0]) <= 0.3 * h
    if not target.any(): return crop.copy()
    # 보간의 경계는 얼굴판 화소 중 눈빛(주황)만 뺀다 — «남기는 곳» 전체를 빼면 둘레가 모두 남기는 곳인 입은 경계가 없어 메워지지 않았다
    # 눈 점의 흰 심(채도가 낮아 주황으로 안 잡힘)도 뺀다 — 경계에 넣으면 그 밝기가 메운 곳으로 번져 눈 옆에 흰 얼룩이 생겼다(03번 12번)
    eye_light = ndi.binary_dilation(warm_of(crop, visor) | (keep & (crop.max(2) >= 100)), iterations=2)
    # 밝은 화소(밝기 100 이상)도 경계에서 뺀다 — 얼굴 앞 슬레이트의 흰 칸·손가락 끝이 얼굴판 구멍으로 메워져 경계가 되면 그 흰빛이 메운 곳으로
    # 번졌다(03번 110·133번 실측). 얼굴판 자체의 경계는 어두운 화소로 충분하다
    return fix.harmonic_fill(crop, target, visor & ~eye_light & (crop.max(2) < 100))


def mouth_area(shape, mouth_xy, h, p):
    """입 자리 = 맞춘 기울기·배율의 MOUTH_CORE 타원. 옆얼굴(가로 배율 NARROW 미만)은 얼굴 높이 0.3배 원."""
    yy, xx = np.mgrid[:shape[0], :shape[1]]; dx, dy = xx - mouth_xy[0], yy - mouth_xy[1]
    if p[1] < NARROW: return np.hypot(dx, dy) <= 0.3 * h
    c, s_ = math.cos(math.radians(p[0])), math.sin(math.radians(p[0]))
    u, w = c * dx + s_ * dy, -s_ * dx + c * dy
    return (u / (MOUTH_CORE[0] * h * p[1])) ** 2 + (w / (MOUTH_CORE[1] * h * p[2])) ** 2 <= 1


def check_frame(crop, visor, paint, keep, occ, h, keep_smile, mouth_xy, p):
    """① 반환: (밝은 것, 어두운 선, 가림 둘레의 밝은 것, 가림 둘레의 어두운 선) 화소 수.
    어두운 선은 입 자리(mouth_area) 안만 본다 — 얼굴판 전체를 보면 눈 둘레의 원래 그늘과 옆얼굴의 좁은 얼굴판 그늘을 «미소선»으로
    잡았다(07번 3·150·185·89·99번 실측). 밝은 것은 칠하는 곳 전체를 본다."""
    v = extend_visor(crop.astype(np.float64), visor).max(2)
    local = ndi.median_filter(v, size=31)
    bright = paint & ~keep & (v - local >= BRIGHT_C) & (v >= BRIGHT_V)
    # 얼굴판 아래 가장자리의 윤기(크림색 테두리가 비친 띠)는 원화에도 있는 것이다 — 가장자리에서 얼굴 높이의 RIM_GLOSS배 안에만 있는
    # 얇은 밝은 덩어리는 입으로 세지 않는다(03번 15·80·100번 실측: 아래 가장자리 띠가 «밝은 것»으로 잡혔다)
    dv = ndi.distance_transform_edt(visor); bl, bn = ndi.label(bright)
    for j, sl in enumerate(ndi.find_objects(bl), 1):
        m = bl[sl] == j
        if dv[sl][m].max() <= RIM_GLOSS * h: bright[sl] &= ~m
    dark = np.zeros(bright.shape, bool)
    if not keep_smile:
        k = max(5, int(DARK_K * h) | 1)
        closed = ndi.grey_closing(np.where(keep, 0, v), size=(k, k))   # 눈은 0으로(repaint와 같은 기준)
        d = thin_dark(paint & ~keep & mouth_area(v.shape, mouth_xy, h, p) & ((closed - v) >= DARK_C), mouth_xy, h)
        lab, n = ndi.label(d)
        if n:
            sizes = ndi.sum(d, lab, range(1, n + 1))
            dark = np.isin(lab, [j + 1 for j, s in enumerate(sizes) if s >= 8])
    return int((bright & ~occ).sum()), int((dark & ~occ).sum()), int((bright & occ).sum()), int((dark & occ).sum())


def frames_spec(spec, n):
    if not spec: return set(range(1, n + 1))
    return {x for part in spec.split(',') for x in range(int(part.split('-')[0]), int(part.split('-')[-1]) + 1)}


def scan(files, faces, zone, keep_smile, inject=None):
    """보정 결과(또는 보정 전) 프레임을 훑어 ①과 윤곽·칠하는 곳·주황 화소 수를 모은다."""
    track = follow(files, faces, inject)
    res = {'mouth': [], 'occluded': [], 'misfit': [], 'paint': {}, 'warm': {}, 'outline': []}
    masks = {}
    for i, (rgb, items) in enumerate(track_boxes(files, REGIONS, faces), 1):
        if inject: rgb = inject(i, rgb, items)
        paint_all = np.zeros(rgb.shape[:2], bool); warm_n = 0
        for fi, b, sc in items:
            rec = track.get((i, fi)); ref = art_ref(fi, sc)
            big, core = gate.expand(b, rgb.shape); crop = rgb[big[1]:big[3], big[0]:big[2]]; org = (big[0], big[1])
            if rec is None or rec['iou'] < FIT_MIN:
                res['misfit'].append({'frame': i, 'face': fi + 1, 'iou': round(rec['iou'], 2) if rec else 0}); continue
            z = zones(crop, org, core, ref, rec['p'], window_keep(track, i, fi, rec['p'], ref, crop.shape[:2], org), zone,
                      window_keep(track, i, fi, rec['p'], ref, crop.shape[:2], org, 0))
            if z is None:
                res['misfit'].append({'frame': i, 'face': fi + 1, 'iou': 0}); continue
            visor, paint, keep, occ, mouth, _ = z
            h = core[3] - core[1]
            nb, nd, ob, od = check_frame(crop, visor, paint, keep, occ, h, keep_smile, mouth, rec['p'])
            if nb >= BRIGHT_N or nd >= DARK_N: res['mouth'].append({'frame': i, 'face': fi + 1, 'bright': nb, 'dark': nd})
            elif ob >= BRIGHT_N or od >= DARK_N: res['occluded'].append({'frame': i, 'face': fi + 1, 'bright': ob, 'dark': od})
            paint_all[big[1]:big[3], big[0]:big[2]] |= paint
            warm_n += int((warm_of(crop, visor) & visor).sum())
            # ② 윤곽은 어두운 얼굴판 덩어리를 맞춘 원화 모양으로 자른 것으로 잰다 — 입 자리를 볼록 다각형까지 넓힌 칠하기용 얼굴판으로 재면
            # 옆얼굴에서 넓힌 모양이 프레임마다 달라 «무너짐»으로 잡혔다(07번 89·99·122번)
            rawv = visor_of(crop, core)
            outline_m = ndi.binary_fill_holes(rawv & ndi.binary_dilation(render(rec['p'], ref, rawv.shape, org), iterations=2)) if rawv is not None else visor
            full = np.zeros(rgb.shape[:2], bool); full[big[1]:big[3], big[0]:big[2]] = outline_m
            masks.setdefault(fi, []).append((i, full, b))
        res['paint'][i] = paint_all; res['warm'][i] = warm_n
    # ② 윤곽: 프레임 t가 앞(t-1)과도 뒤(t+1)와도 다르면(둘 중 작은 값) 순간적으로 무너졌다 돌아온 것이다. 고개를 돌리는 움직임은
    #    앞뒤 한쪽과는 비슷해서 걸리지 않는다. 값 = 두 윤곽의 다른 넓이 ÷ 둘레(평균 몇 화소 어긋났나), 추적한 상자 이동만큼 맞춘 뒤 잰다
    def diff(m1, b1, m2, b2):
        sh = np.roll(np.roll(m1, b2[1] - b1[1], 0), b2[0] - b1[0], 1)
        return float((m2 ^ sh).sum() / max(1, (m2 & ~ndi.binary_erosion(m2)).sum()))
    for fi, seq in masks.items():
        vals = []
        for k in range(1, len(seq) - 1):
            (i0, m0, b0), (i1, m1, b1), (i2, m2, b2) = seq[k - 1], seq[k], seq[k + 1]
            if i1 - i0 != 1 or i2 - i1 != 1: continue
            vals.append({'frame': i1, 'face': fi + 1, 'px': round(min(diff(m0, b0, m1, b1), diff(m2, b2, m1, b1)), 3)})
        med = float(np.median([o['px'] for o in vals])) if vals else 0
        res['outline'] += [o for o in vals if o['px'] > max(OUTLINE_PX, OUTLINE_X * med)]
    return res


def runs(nums):
    out = []
    for n in sorted(set(nums)):
        if out and n == out[-1][1] + 1: out[-1][1] = n
        else: out.append([n, n])
    return ' '.join(f'{a}~{b}번({(a - 1) / 24:.2f}~{(b - 1) / 24:.2f}초)' for a, b in out)


def run_check(files, faces, zone, keep_smile, source=None, inject=None):
    res = scan(files, faces, zone, keep_smile, inject)
    out = {'mouth': res['mouth'], 'occluded': res['occluded'], 'misfit': res['misfit'], 'outline': res['outline'],
           'outline_source': [], 'rim_changed': [], 'eye_lost': []}
    if source:
        src_files = sorted(glob.glob(os.path.join(source, '*.png')))
        if [os.path.basename(f) for f in src_files] != [os.path.basename(f) for f in files]:
            raise SystemExit('보정 전 폴더의 프레임 이름이 보정 결과와 다르다 — 같은 영상끼리만 비교한다')
        src = scan(src_files, faces, zone, keep_smile)
        src_out = {(o['frame'], o['face']) for o in src['outline']}
        near = lambda o: any((o['frame'] + d, o['face']) in src_out for d in (-1, 0, 1))
        out['outline_source'] = [o for o in res['outline'] if near(o)]
        out['outline'] = [o for o in res['outline'] if not near(o)]
        for i, (fo, fs) in enumerate(zip(files, src_files), 1):
            a = np.asarray(Image.open(fo).convert('RGB')); s = np.asarray(Image.open(fs).convert('RGB'))
            if inject: a = inject(i, a, None)
            changed = (a != s).any(2) & ~ndi.binary_dilation(src['paint'][i], iterations=2)
            if changed.sum(): out['rim_changed'].append({'frame': i, 'px': int(changed.sum())})
            fitted = lambda r: not any(m['frame'] == i for m in r['misfit'])
            if not (fitted(src) and fitted(res)): continue          # 얼굴판을 못 맞춘 프레임은 «사람 확인»으로 이미 낸다
            # 눈을 거의 다 감은 프레임은 주황 화소가 몇 개뿐이라 비율만 보면 한두 화소 차이로 걸렸다(03번 139~142번) — 8화소 넘게 줄어야 한다
            if src['warm'][i] - res['warm'].get(i, 0) > max(8, EYE_LOSS * src['warm'][i]):
                out['eye_lost'].append({'frame': i, 'before': src['warm'][i], 'after': res['warm'].get(i, 0)})
    return out


def main():
    global SCENE
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('out', nargs='?')
    ap.add_argument('--frames', default=''); ap.add_argument('--faces', default=''); ap.add_argument('--zone', default='mouth', choices=['mouth', 'full'])
    ap.add_argument('--keep-smile', action='store_true'); ap.add_argument('--compare'); ap.add_argument('--check', action='store_true')
    ap.add_argument('--source'); ap.add_argument('--json'); ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--plate-margin', type=float, default=0.0)
    a = ap.parse_args()
    SCENE = a.scene.zfill(2)
    global PLATE_MARGIN
    PLATE_MARGIN = a.plate_margin
    regions = REGIONS[:] = load_regions(SCENE)
    faces = [int(x) - 1 for x in a.faces.split(',')] if a.faces else list(range(len(regions)))
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2

    if a.check or a.selftest:
        inject = None
        if a.selftest:
            if not a.source: ap.error('--selftest는 --source(보정 전 프레임)와 함께 돌린다')
            # 가짜 자국은 앞을 보는 프레임(원화 얼굴판과 잘 맞고 가로 배율 0.85 이상)에 그린다 — 고개를 돌린 프레임에 그리면 입 자리가
            # 얼굴판 가장자리에 걸려 «소품»으로 갈렸고(07번 10번), 상자 아래쪽에 그린 홈은 얼굴판에 닿지 않았다(07번 30번)
            pre = follow(files, faces)
            # 보정 전에도 윤곽이 움직이는 프레임(앞뒤 3프레임)은 고르지 않는다 — 거기 그린 홈은 «보정 전에도 같은 움직임»(사람 확인)으로
            # 갈려 ②가 실패로 세지 않았다(07번 54번)
            moving = {o['frame'] + d for o in scan(sorted(glob.glob(os.path.join(a.source, '*.png'))), faces, a.zone, a.keep_smile)['outline'] for d in range(-3, 4)}
            good = [i for i in range(5, len(files) - 4) if i not in moving and (pre.get((i, faces[0])) or {}).get('iou', 0) >= 0.9
                    and pre[(i, faces[0])]['p'][1] >= 0.85]
            roles = []
            for i in good:
                if not roles or i - roles[-1] >= 8: roles.append(i)
                if len(roles) == 4: break
            if len(roles) < 4: print('자기검사: 앞을 보는 프레임이 넷이 안 된다 — 이 장면으로는 자기검사를 할 수 없다', file=sys.stderr); return 2
            ROLE = dict(zip(('white', 'dark', 'notch', 'eye'), roles)); boxes = {}
            # 지운 눈은 눈이 가장 크게 뜬 프레임에 — 눈을 감는 프레임은 주황이 몇 화소뿐이라 덮어도 «눈 지워짐» 기준을 못 넘었다(03번 43번)
            far = [i for i in good if all(abs(i - j) >= 8 for j in roles[:3])]
            if far: ROLE['eye'] = roles[3] = max(far, key=lambda i: len(pre[(i, faces[0])]['eyes']))
            print('자기검사 프레임: ' + ' · '.join(f'{k} {v}번' for k, v in ROLE.items()))
            def inject(i, rgb, items):            # 흰 입·어두운 미소선·테두리 홈·지운 눈을 그린다
                if i not in roles: return rgb
                fi = faces[0]; rec = pre[(i, fi)]; ref = art_ref(fi, np.asarray(rgb).shape[1] / Image.open(os.path.join(gate.ART_DIR, f'{SCENE}.png')).width)
                if items: boxes[i] = items[0][1]          # 같은 프레임은 몇 번 불려도 같은 자리에 그린다(③ 검사는 상자 없이 부른다)
                mx, my = fwd(rec['p'], ref, ref['mouth'])[0]; b = boxes.get(i, ref['box']); h = b[3] - b[1]
                # 가짜 입은 입 자리 안에서 눈·가장자리에서 가장 먼 곳에 그린다 — 원화 입 자리에 그대로 그리면 07번처럼 입이 눈 바로 옆인
                # 장면에서 눈 둘레(남기는 곳)·가장자리와 겹쳐, 검사가 아니라 그림 자리 때문에 «놓침»이 나왔다
                big, core = gate.expand(b, rgb.shape); cr = np.asarray(rgb)[big[1]:big[3], big[0]:big[2]]; vis0 = visor_of(cr, core)
                if vis0 is not None and i != ROLE['dark']:   # 되돌리는 원래 입은 원래 입 자리 그대로
                    ok = mouth_area(vis0.shape, (mx - big[0], my - big[1]), h, rec['p']) & ndi.binary_erosion(vis0, iterations=max(1, int(0.12 * h)))
                    ok &= ~ndi.binary_dilation(warm_of(cr, vis0), iterations=max(1, int(0.12 * h)))
                    if ok.any():
                        dd = ndi.distance_transform_edt(ok); yy0, xx0 = np.unravel_index(int(np.argmax(dd)), dd.shape)
                        mx, my = xx0 + big[0], yy0 + big[1]
                im = Image.fromarray(rgb.copy()); d = ImageDraw.Draw(im)
                if i == ROLE['white']: d.arc([mx - 0.12 * h, my - 0.1 * h, mx + 0.12 * h, my + 0.05 * h], 20, 160, fill=(245, 245, 245), width=4)
                # 어두운 미소선 자기검사는 그려 넣지 않고 «보정 전 프레임의 입 자리를 그대로 되돌린다» — 진짜로 남은 미소선과 같은 모양이다.
                # 검정 호를 그리면 거의 검은 얼굴판 위에서는 대비가 없어(원화 미소선은 윤기 위에서만 보인다) 검사가 아니라 그림 때문에
                # «놓침»이 나왔다(03번 25번·07번 17번, 세 번 고쳐도 같음 → 방식을 바꿈)
                if i == ROLE['notch']:                # 입 아래 얼굴판 아래 가장자리에 크림색 홈
                    big, core = gate.expand(b, rgb.shape); vis = visor_of(rgb[big[1]:big[3], big[0]:big[2]], core)
                    col = vis[:, int(round(mx)) - big[0]] if vis is not None else None
                    yb = big[1] + int(np.nonzero(col)[0].max()) if col is not None and col.any() else int(my + 0.3 * h)
                    w = b[2] - b[0]; d.ellipse([mx - 0.15 * w, yb - 0.1 * h, mx + 0.15 * w, yb + 0.1 * h], fill=(230, 215, 200))
                out = np.asarray(im)
                if i == ROLE['dark']:
                    src = np.asarray(Image.open(sorted(glob.glob(os.path.join(a.source, '*.png')))[i - 1]).convert('RGB'))
                    big, core = gate.expand(b, rgb.shape)
                    ma = np.zeros(out.shape[:2], bool)
                    ma[big[1]:big[3], big[0]:big[2]] = mouth_area((big[3] - big[1], big[2] - big[0]), (mx - big[0], my - big[1]), h, rec['p'])
                    out = out.copy(); out[ma] = src[ma]
                if i == ROLE['eye']:                  # 눈 하나를 얼굴판 검정으로 덮는다
                    out = out.copy()
                    big, core = gate.expand(b, rgb.shape); crop = out[big[1]:big[3], big[0]:big[2]]
                    vis = visor_of(crop, core)
                    if vis is not None:
                        # 얼굴판 볼록 다각형 안의 주황만 — 머리 옆 금색 귀 고리가 가장 큰 주황이면 그걸 덮어 «눈 지움»이 되지 않았다(03번 43번)
                        warm = warm_of(crop, vis) & gate.hull_mask(vis); lab, n = ndi.label(warm)
                        if n:
                            j = 1 + int(np.argmax(ndi.sum(warm, lab, range(1, n + 1))))
                            crop[ndi.binary_dilation(lab == j, iterations=2)] = (12, 10, 10)
                return out
        r = run_check(files, faces, a.zone, a.keep_smile, a.source, inject)
        if a.json: json.dump(r, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
        fr = lambda rows: f'{len({x["frame"] for x in rows})}프레임 {runs([x["frame"] for x in rows])}'.strip()
        print(f'{SCENE}: {len(files)}프레임 · ① 입(눈 아닌 밝은 것·어두운 선) {fr(r["mouth"])} · ② 얼굴선 무너짐 {fr(r["outline"])}'
              + (f' · ③ 칠하는 곳 밖 바뀐 프레임 {fr(r["rim_changed"])} · ④ 눈 지워짐 {fr(r["eye_lost"])}' if a.source else ''))
        human = [('① 소품이 가린 둘레에서 걸림', r['occluded']), ('② 보정 전에도 같은 움직임', r['outline_source']), ('얼굴판 못 맞춤(칠하지 않음)', r['misfit'])]
        for name, rows in human:
            if rows: print(f'  사람 확인 · {name}: {fr(rows)}')
        if a.selftest:
            W_, D_, N_, E_ = ROLE['white'], ROLE['dark'], ROLE['notch'], ROLE['eye']
            got = {f'흰 입({W_})': any(x['frame'] == W_ and x['bright'] >= BRIGHT_N for x in r['mouth']),
                   f'되돌린 원래 입({D_})': any(x['frame'] == D_ for x in r['mouth']),
                   f'테두리 홈({N_}) ②': any(o['frame'] in (N_ - 1, N_, N_ + 1) for o in r['outline']),
                   f'테두리 홈({N_}) ③': any(o['frame'] == N_ for o in r['rim_changed']),
                   f'지운 눈({E_}) ④': any(o['frame'] == E_ for o in r['eye_lost'])}
            for k, ok in got.items(): print(f'자기검사 · {k}: {"걸림" if ok else "놓침"}')
            return 0 if all(got.values()) else 1
        if r['mouth'] or r['outline'] or r['rim_changed'] or r['eye_lost']: return 1
        return 3 if any(rows for _, rows in human) else 0

    if not a.out: ap.error('출력 폴더가 필요하다')
    os.makedirs(a.out, exist_ok=True)
    todo = frames_spec(a.frames, len(files)); fixed, skipped = [], []
    track = follow(files, faces)
    for i, (rgb, items) in enumerate(track_boxes(files, regions, faces), 1):
        name = os.path.basename(files[i - 1])
        if i not in todo: shutil.copyfile(files[i - 1], os.path.join(a.out, name)); continue
        out = rgb.copy()
        for fi, b, sc in items:
            rec = track.get((i, fi)); ref = art_ref(fi, sc)
            if rec is None or rec['iou'] < FIT_MIN: skipped.append(i); continue
            big, core = gate.expand(b, rgb.shape); org = (big[0], big[1])
            crop = out[big[1]:big[3], big[0]:big[2]]
            z = zones(crop, org, core, ref, rec['p'], window_keep(track, i, fi, rec['p'], ref, crop.shape[:2], org), a.zone,
                      window_keep(track, i, fi, rec['p'], ref, crop.shape[:2], org, 0))
            if z is None: skipped.append(i); continue
            visor, paint, keep, _, mouth, narrow = z
            out[big[1]:big[3], big[0]:big[2]] = repaint(crop, visor, paint, keep, core[3] - core[1], a.keep_smile, mouth, narrow, rec['p'][:3])
        Image.fromarray(out).save(os.path.join(a.out, name)); fixed.append(i)
        if a.compare:
            os.makedirs(a.compare, exist_ok=True)
            b = items[0][1]; pad = 20
            box = (max(0, b[0] - pad), max(0, b[1] - pad), min(rgb.shape[1], b[2] + pad), min(rgb.shape[0], b[3] + pad))
            Image.fromarray(rgb).crop(box).save(os.path.join(a.compare, f'{i:03d}-before.png'))
            Image.fromarray(out).crop(box).save(os.path.join(a.compare, f'{i:03d}-after.png'))
    print(f'{SCENE}: {len(files)}장 · 다시 칠한 프레임 {len(fixed)}' + (f' · 얼굴판 못 맞춰 안 칠함(사람 확인) {runs(skipped)}' if skipped else ''))


if __name__ == '__main__':
    sys.exit(main())

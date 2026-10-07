"""Poster Studio 대기 영상 보정: 생성 영상이 그려 넣은 «원화에 없는 얼굴 요소»를 검은 얼굴판 색으로 지운다.

왜(2026-10-07): 얼굴 규칙(2026-10-06 Bumm님 확정 — 원화에 없는 눈썹·입을 만들지 않는다)을 지시문에 넣어도 Veo가 로봇이
정면을 볼 때 하얀 웃는 입을 그렸다(01번 두 번 모두). 원화의 얼굴판은 주황 눈 두 개 말고는 검다 — 그래서 새로 생긴 표시만
얼굴판 색으로 메우면 원화와 같은 얼굴이 된다. 눈·원화에 있던 요소(08번의 입)는 건드리지 않는다.

지우는 것은 원화에 입이 없는 장면에 생긴 입(하얀·빨간)뿐이다. 흰 입을 지운 뒤 남은 빨간 혀 조각은 --tongue-frames로 사람이 고른
프레임에서만, 아래 --all-mouths와 같은 방식(혀에서 출발해 얼굴판 화소로 매끄럽게 메움)으로 한 번 더 지운다. 눈썹으로 분류된 빛(모양이 바뀐 눈일 수 있다)과 원화에 입이 있는 장면은
손대지 않고 보정 뒤 검사에 그대로 남겨 사람이 판단한다.
판정은 얼굴 검사(check-face-elements.py)와 같은 함수를 쓴다. 다만 검사는 «원화 눈 넓이의 15% 이상»만 탈락으로 세지만,
보정은 크기와 상관없이 새 요소를 전부 지운다(입이 나타나고 사라지는 사이의 작은 조각까지). 지운 자리는 둘레 4화소까지 넓혀
빛 번짐까지 덮고, 얼굴판 안에서만, 가장 가까운 얼굴판 화소의 색으로 채운 뒤 그 안에서만 살짝 부드럽게 한다.
눈빛이 안 보이는 프레임(눈 감음·고개 돌림)은 판정을 못 하므로, 앞뒤에서 지운 자리 안의 밝은 표시만 지운다.

--all-mouths면 원화에 입이 있는 장면에서도 입을 모두 지운다 — 08번(원화에 벌린 입)을 «입만 지워» 다른 장면과 같은 얼굴로
맞추라는 2026-10-07 Bumm님 결정 때문이다. 벌린 입은 밝은 표시(혀)만이 아니라 얼굴판보다 더 검은 입 모양이라, 위의 표시 지우기로는
혀만 빠지고 검은 입이 남았다. 게다가 08번은 헤드폰·팝 필터가 얼굴판 볼록 다각형에 섞여 흰 테두리·헤드폰까지 검게 번졌다(2026-10-07 실측).
그래서 이 모드는 따로 간다: 빨간 혀와 그에 붙은 «거의 검은» 입 모양·입술 선만 찾아(얼굴판 덩어리 안), 둘레의 얼굴판 화소만
경계로 매끄럽게 메운다(라플라스 보간 — 얼굴판의 은은한 명암이 그대로 이어진다). 눈빛·흰 테두리·팝 필터 테두리는 메우지도, 경계로 쓰지도 않는다.
이때는 보정 뒤 검사도 --all-mouths로 돌린다. 검사는 밝은 표시만 세므로 검은 입이 남았는지는 사람이 전후 그림으로 본다.

보정 뒤에는 반드시 얼굴 검사를 다시 돌려 0프레임인지 보고, 지운 프레임은 사람이 확대해 본다(--compare 전후 그림).
사용: python scripts/media/remove-face-marks.py <장면 01~12> <원본 프레임 폴더> <출력 폴더> [--compare 전후 그림 폴더] [--all-mouths | --tongue-frames 121-140,167]
"""
import argparse, glob, importlib.util, json, os, shutil
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('gate', os.path.join(HERE, 'check-face-elements.py'))
gate = importlib.util.module_from_spec(spec); spec.loader.exec_module(gate)
gate.EXTRA_RATIO = 0.0     # 보정은 크기와 상관없이 지운다(검사는 원래 기준 그대로)
GROW = 4                   # 표시 둘레의 빛 번짐까지 덮는 폭(화소)
NEIGHBOR = 3               # 눈빛이 안 보이는 프레임은 앞뒤 이만큼의 프레임에서 지운 자리를 빌린다


def fill(rgb, region, hull):
    """region 화소를 얼굴판(hull) 안 가장 가까운 «안 지우는» 화소 색으로 채우고, region 안에서만 살짝 부드럽게 한다."""
    keep = hull & ~region
    if not keep.any(): return rgb
    _, (iy, ix) = ndi.distance_transform_edt(~keep, return_indices=True)
    out = rgb.astype(np.float64)
    near = out[iy, ix]
    soft = np.stack([ndi.gaussian_filter(near[..., k], 1.5) for k in range(3)], -1)
    out[region] = soft[region]
    return np.clip(out.round(), 0, 255).astype(np.uint8)


def dark_hull(crop, core):
    """눈빛 조건 없이 얼굴판의 볼록 다각형만 구한다 — 눈 감은 프레임용. 얼굴판 고르는 기준은 검사(face_marks)와 같다."""
    v = crop.max(2).astype(np.int32)
    cx0, cy0, cx1, cy1 = core; ch, cw = cy1 - cy0, cx1 - cx0
    lab, n = ndi.label(ndi.binary_closing(v < gate.DARK, iterations=3))
    if not n: return None
    idx = range(1, n + 1)
    sizes = ndi.sum(np.ones(lab.shape), lab, idx); in_core = ndi.sum(np.ones((ch, cw)), lab[cy0:cy1, cx0:cx1], idx)
    keep = np.isin(lab, 1 + np.flatnonzero((sizes >= 0.05 * ch * cw) & (in_core >= gate.CORE_SHARE * sizes)))
    return gate.hull_mask(keep) if keep.sum() >= 50 else None


TONGUE_HUE = 0.12          # (초록-파랑)/(빨강-파랑). 혀(분홍빛 빨강) 0.07 안팎, 눈빛 가장자리(주황) 0.2 넘음 — 08번 실측
MOUTH_GROW = 5             # 찾은 입 둘레를 이만큼 넓혀 메운다(흐린 입 윤곽·입술 선까지)
FILL_STEPS = 400           # 라플라스 보간 반복 수


def open_mouth(crop, core):
    """메울 자리(혀·벌린 입)와 경계로 쓸 얼굴판 화소. 혀가 안 보이면 (None, None). --all-mouths(08번)와, 기본 보정에서
    --tongue-frames로 고른 프레임(흰 입을 지운 뒤 남은 혀 조각)에 쓴다.
    얼굴판 덩어리 = 얼굴 상자와 가장 많이 겹치는 어두운 덩어리(닫기 없이 — 닫으면 헤드폰과 이어진다), 눈·혀 구멍은 메운다.
    혀 = 그 안의 빨강 덩어리(색상 비율로 눈빛 가장자리의 주황과 가른다 — 감은 눈 ∪의 빛 가장자리도 붉다).
    입 = 혀 + 혀에 닿은 «둘레 얼굴판보다 훨씬 검은» 입 모양·입술 선. 그 둘레 MOUTH_GROW화소를 눈빛·회색 테두리만 빼고 메운다."""
    v = crop.max(2).astype(np.int32)
    r, g, b = (crop[..., k].astype(np.int32) for k in range(3))
    cx0, cy0, cx1, cy1 = core
    lab, n = ndi.label(v < gate.DARK)
    if not n: return None, None
    overlap = ndi.sum(np.ones((cy1 - cy0, cx1 - cx0)), lab[cy0:cy1, cx0:cx1], range(1, n + 1))
    body = lab == 1 + int(np.argmax(overlap))
    visor = ndi.binary_fill_holes(body)
    hull = gate.hull_mask(body)
    hue = (g - b) / np.maximum(r - b, 1)
    reddish = (r - np.maximum(g, b) > 40) & (r > 70)
    # 혀 = 넓이의 절반 이상이 얼굴판 볼록 다각형 안에 있는 빨강 덩어리(12화소 이상) 중 가장 큰 것. 얼굴판에 «둘러싸인» 것만 보면
    # 얼굴판 아래 테두리에 붙은 혀 조각을 놓쳤다(04번 122~133번은 63~74%만 다각형 안)
    tlab, tn = ndi.label(reddish & (hue < TONGUE_HUE))
    if not tn: return None, None
    idx = range(1, tn + 1)
    sizes, inside = ndi.sum(np.ones(tlab.shape), tlab, idx), ndi.sum(hull, tlab, idx)
    ok = np.flatnonzero((sizes >= 12) & (inside >= 0.5 * sizes))
    if not len(ok): return None, None
    tongue = tlab == 1 + int(ok[np.argmax(sizes[ok])])
    # 눈빛 = 얼굴판 안의 밝거나 붉은 덩어리 중 혀에 닿지 않는 것. 혀 가장자리의 주황빛 화소까지 눈빛으로 빼면 빨간 조각이 남았다
    lit = visor & (reddish | (v >= 120))
    llab, _ = ndi.label(lit)
    near_t = ndi.binary_dilation(tongue, iterations=4)
    # 혀에 닿은 밝은 덩어리 중 혀 빛깔이거나(색상 비율 평균 < 0.2) 혀보다 작은 것(입술 선)만 입이다. 번짐이 넓은 눈빛이
    # 혀 곁까지 닿으면 눈까지 입으로 잡혀, 메운 자리가 눈 옆까지 네모나게 번졌다(08번 129번 실측)
    touch = np.unique(llab[near_t & lit]); touch = touch[touch > 0]
    touch = np.array([j for j in touch if hue[llab == j].mean() < 0.2 or (llab == j).sum() < 0.5 * tongue.sum()], dtype=int)
    eye_lit = lit & ~np.isin(llab, touch)
    glow = ndi.binary_dilation(eye_lit, iterations=2)                # 눈빛 — 메우지도, 경계로 쓰지도 않는다
    halo = ndi.binary_dilation(eye_lit, iterations=7)                # 눈빛 번짐 — 입 자체가 아니면 메우지 않는다(경계로는 쓴다).
    # 번짐을 피하지 않으면 번짐이 칼로 자른 듯 끊기고, 번짐 화소를 경계에서 빼지 않으면 보간이 갈색으로 번진다.
    # 대신 번짐 안에 들어온 입 자체(혀·검은 입 둘레 3화소)는 메운다 — 안 그러면 입 끝이 점으로 남았다(08번 127·129번 실측)
    local = ndi.median_filter(np.where(visor, v, 0), size=31)
    reach = max(12, int(3 * np.sqrt(tongue.sum())))               # 초승달 입 끝은 혀에서 혀 크기의 3배까지 간다(1.5배면 끝이 점으로 남았다)
    dark = visor & (v <= np.maximum(8, 0.7 * local)) & ndi.binary_dilation(tongue, iterations=reach)   # 입 윤곽(둘레의 0.55~0.7배)까지 — 0.55면 윤곽이 점으로 남았다(08번 127번)
    dlab, dn = ndi.label(dark)
    mouth = tongue | np.isin(llab, touch)
    for j in range(1, dn + 1):
        m = dlab == j
        if (m & near_t).any(): mouth |= m
    # 메울 자리 = 찾은 입(혀·검은 입·입술 선)에서 MOUTH_GROW화소. 입 상자를 키운 타원·네모로 잡으면 입과 상관없는
    # 눈빛 번짐 곁까지 들어가 그 자리가 네모난 갈색 조각으로 남았다(08번 129번 실측)
    near_mouth = ndi.binary_dilation(mouth, iterations=MOUTH_GROW)
    # 경계는 «긴» 회색 선(팝 필터·얼굴판 테두리, 60화소 이상)만이다 — 입술 끝의 짧은 회색 선까지 막으면 그 선이 남았다(08번 58번 실측)
    gray = (v >= 60) & (crop.max(2).astype(np.int32) - crop.min(2) <= 25) & ~mouth
    glab, gn = ndi.label(gray)
    long_gray = np.isin(glab, 1 + np.flatnonzero(ndi.sum(gray, glab, range(1, gn + 1)) >= 60)) if gn else gray
    gray_edge = ndi.binary_dilation(long_gray, iterations=1) & ~tongue
    cand = near_mouth & (visor | mouth) & ~glow & (~halo | ndi.binary_dilation(mouth, iterations=3)) & ~gray_edge
    clab, _ = ndi.label(cand)
    keep = np.unique(clab[ndi.binary_dilation(mouth, iterations=1) & cand])
    region = np.isin(clab, keep[keep > 0])
    return region, visor & ~glow & ~gray_edge


def harmonic_fill(rgb, region, visor):
    """region을 둘레의 얼굴판 화소(visor 안, region 밖 — 눈빛 심·회색 테두리 제외)만 경계로 라플라스 보간해 메운다."""
    ys, xs = np.nonzero(region)                                  # 입 둘레만 잘라 계산한다(빠르게)
    y0, y1, x0, x1 = max(0, ys.min() - 4), min(rgb.shape[0], ys.max() + 5), max(0, xs.min() - 4), min(rgb.shape[1], xs.max() + 5)
    reg, vis = region[y0:y1, x0:x1], visor[y0:y1, x0:x1]
    out = rgb[y0:y1, x0:x1].astype(np.float64)
    known = vis & ~reg
    ring = ndi.binary_dilation(reg, iterations=2) & known
    if not ring.any(): return rgb
    out[reg] = out[ring].mean(0)
    use = (reg | known).astype(np.float64)
    use[0, :] = use[-1, :] = use[:, 0] = use[:, -1] = 0     # np.roll이 반대편 가장자리를 끌어오지 않게
    for _ in range(FILL_STEPS):
        acc = np.zeros_like(out); cnt = np.zeros(out.shape[:2])
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(out * use[..., None], (dy, dx), (0, 1)); cnt += np.roll(use, (dy, dx), (0, 1))
        upd = acc / np.maximum(cnt, 1)[..., None]
        out[reg] = upd[reg]
    res = rgb.copy(); res[y0:y1, x0:x1] = np.clip(out.round(), 0, 255).astype(np.uint8)
    return res


def remove_open_mouths(a, scene, regions, files):
    first = np.asarray(Image.open(files[0]).convert('RGB'))
    art_w = Image.open(os.path.join(gate.ART_DIR, f'{scene}.png')).width
    s = first.shape[1] / art_w
    boxes = [[int(round(c * s)) for c in f['face']] for f in regions]
    report = {'frames': len(files), 'fixed': [], 'no_mouth': []}
    prev = None
    for i, f in enumerate(files):
        rgb = np.asarray(Image.open(f).convert('RGB')).copy(); g = gate.gray(rgb)
        if prev is not None: boxes = [gate.track(prev, g, bx) for bx in boxes]
        prev = g; changed = False
        for bx in boxes:
            big, core = gate.expand(bx, rgb.shape)
            crop = rgb[big[1]:big[3], big[0]:big[2]]
            region, visor = open_mouth(crop, core)
            if region is None: report['no_mouth'].append(i + 1); continue
            rgb[big[1]:big[3], big[0]:big[2]] = harmonic_fill(crop, region, visor); changed = True
        name = os.path.basename(f)
        Image.fromarray(rgb).save(os.path.join(a.out, name)) if changed else shutil.copyfile(f, os.path.join(a.out, name))
        if changed:
            report['fixed'].append(i + 1)
            if a.compare:
                os.makedirs(a.compare, exist_ok=True)
                b = boxes[0]; pad = 20
                box = (max(0, b[0] - pad), max(0, b[1] - pad), min(rgb.shape[1], b[2] + pad), min(rgb.shape[0], b[3] + pad))
                Image.open(f).convert('RGB').crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-before.png'))
                Image.fromarray(rgb).crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-after.png'))
    json.dump(report, open(os.path.join(a.out, '..', os.path.basename(a.out.rstrip('/\\')) + '.face-fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(files)}장 · 벌린 입 지운 프레임 {len(report["fixed"])} · 입을 못 찾은 프레임 {len(report["no_mouth"])}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--compare'); ap.add_argument('--all-mouths', action='store_true')
    ap.add_argument('--tongue-frames', default='')   # 예: 121-140,167 — 혀 조각까지 지울 프레임(사람이 확인한 구간)
    a = ap.parse_args()
    tongue_frames = {n for part in a.tongue_frames.split(',') if part for n in range(int(part.split('-')[0]), int(part.split('-')[-1]) + 1)}
    scene = a.scene.zfill(2)
    regions = json.load(open(os.path.join(HERE, 'face-regions.json'), encoding='utf-8'))[scene]
    art = np.asarray(Image.open(os.path.join(gate.ART_DIR, f'{scene}.png')).convert('RGB'))
    refs = [gate.reference(art, f['face']) for f in regions]
    if any(r is None for r in refs): raise SystemExit(f'기준 오류: 원화 {scene}에서 눈 두 개를 못 찾았다')
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: raise SystemExit(f'프레임 0장: {a.src}')
    os.makedirs(a.out, exist_ok=True)
    if a.all_mouths: return remove_open_mouths(a, scene, regions, files)
    first = np.asarray(Image.open(files[0]).convert('RGB'))
    s = first.shape[1] / art.shape[1]
    boxes = [[int(round(c * s)) for c in f['face']] for f in regions]
    # 1) 프레임마다 얼굴 상자를 따라가며 지울 자리(상자 기준 좌표)를 구한다
    plan, prev = [], None
    for f in files:
        rgb = np.asarray(Image.open(f).convert('RGB')); g = gate.gray(rgb)
        if prev is not None: boxes = [gate.track(prev, g, b) for b in boxes]
        prev = g
        per = []
        for b, ref in zip(boxes, refs):
            big, core = gate.expand(b, rgb.shape)     # 검사와 같은 넓힌 영역 — 상자 밖으로 나간 얼굴판까지
            crop = rgb[big[1]:big[3], big[0]:big[2]]
            face = gate.face_marks(crop, core)
            if face is None: per.append({'box': big, 'core': core, 'seen': False, 'mask': None}); continue
            m = np.zeros(crop.shape[:2], bool)
            for e in gate.new_elements(face, ref, s):
                # 지우는 것은 «원화에 입이 없는 장면의 입»뿐이다. 눈썹으로 분류된 따뜻한 빛은 모양이 바뀐 눈일 수 있고(08번: ∪ 눈이 ^ 눈으로),
                # 원화에 입이 있는 장면(08번)의 입을 지우면 원화의 입까지 없어진다 — 둘 다 사람이 판단한다(보정 뒤 검사에 그대로 남는다)
                if e['kind'] == '입' and '입' not in ref['allowed']: m |= face['labels'] == e['idx']
            m = ndi.binary_dilation(m, iterations=GROW) & face['hull'] if m.any() else m
            per.append({'box': big, 'core': core, 'seen': True, 'mask': m, 'hull': face['hull']})
        plan.append(per)
    # 2) 지우기. 눈빛이 안 보이는 프레임은 앞뒤 프레임의 지운 자리 안 밝은 표시만 지운다
    report = {'frames': len(files), 'fixed': [], 'borrowed': [], 'tongue': []}
    for i, f in enumerate(files):
        rgb = np.asarray(Image.open(f).convert('RGB')).copy(); changed = False
        for fi, item in enumerate(plan[i]):
            b = item['box']; crop = rgb[b[1]:b[3], b[0]:b[2]]
            if item['seen']:
                region, hull = item['mask'], item['hull']
            else:
                hull = dark_hull(crop, item['core'])
                if hull is None: continue
                whole = np.zeros(rgb.shape[:2], bool)          # 앞뒤 프레임에서 지운 자리를 화면 좌표로 모은다(상자가 조금씩 움직인다)
                for k in range(max(0, i - NEIGHBOR), min(len(files), i + NEIGHBOR + 1)):
                    o = plan[k][fi]
                    if o['seen'] and o['mask'] is not None and o['mask'].any():
                        ob = o['box']; whole[ob[1]:ob[3], ob[0]:ob[2]] |= o['mask']
                region = whole[b[1]:b[3], b[0]:b[2]]
                if not region.any(): continue
                ch = item['core'][3] - item['core'][1]
                v = crop.max(2).astype(np.int32); local = ndi.median_filter(v, size=max(9, int(0.25 * ch) | 1))
                bright = (v - local >= gate.CONTRAST) & (v >= gate.BRIGHT) & ~gate.warm_mask(crop)
                region = ndi.binary_dilation(region & bright, iterations=GROW) & hull
                if region.any(): report['borrowed'].append(i + 1)
            if region is None or not region.any(): continue
            rgb[b[1]:b[3], b[0]:b[2]] = fill(crop, region, hull); changed = True
        # --tongue-frames로 고른 프레임: 흰 입을 지운 뒤에도 남은 빨간 혀(와 그에 붙은 검은 입)를 지운다. 표시 지우기는 «입»으로 분류된
        # 밝은 덩어리만 지워서 흰 입 아래 어두운 빨강 혀가 남았다(04번 5.0~5.8초·6.9~7.2초, 2026-10-07 실측). 모든 프레임에 자동으로
        # 걸지 않는다: 얼굴판 아래 테두리에 걸친 빨간 연필 끝(02번 1.5초)과 혀 조각이 크기·색·위치로 갈리지 않았다 — 사람이 프레임을 고른다
        for item, ref in zip(plan[i], refs):
            if i + 1 not in tongue_frames or '입' in ref['allowed']: continue
            b = item['box']; crop = rgb[b[1]:b[3], b[0]:b[2]]
            region, known = open_mouth(crop, item['core'])
            if region is None or not region.any(): continue
            rgb[b[1]:b[3], b[0]:b[2]] = harmonic_fill(crop, region, known); changed = True; report['tongue'].append(i + 1)
        name = os.path.basename(f)
        if changed:
            Image.fromarray(rgb).save(os.path.join(a.out, name)); report['fixed'].append(i + 1)
            if a.compare:
                os.makedirs(a.compare, exist_ok=True)
                b = plan[i][0]['box']; pad = 20
                box = (max(0, b[0] - pad), max(0, b[1] - pad), min(rgb.shape[1], b[2] + pad), min(rgb.shape[0], b[3] + pad))
                Image.open(f).convert('RGB').crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-before.png'))
                Image.fromarray(rgb).crop(box).save(os.path.join(a.compare, f'{i + 1:03d}-after.png'))
        else:
            shutil.copyfile(f, os.path.join(a.out, name))
    report['borrowed'] = sorted(set(report['borrowed']))
    json.dump(report, open(os.path.join(a.out, '..', os.path.basename(a.out.rstrip('/\\')) + '.face-fix.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(files)}장 · 지운 프레임 {len(report["fixed"])} · 그중 앞뒤에서 빌린 프레임 {len(report["borrowed"])} · 혀 조각까지 지운 프레임 {len(report["tongue"])}')


if __name__ == '__main__':
    main()

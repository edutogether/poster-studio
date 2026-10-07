"""Poster Studio 대기 영상 보정: 생성 영상이 그려 넣은 «원화에 없는 얼굴 요소»를 검은 얼굴판 색으로 지운다.

왜(2026-10-07): 얼굴 규칙(2026-10-06 Bumm님 확정 — 원화에 없는 눈썹·입을 만들지 않는다)을 지시문에 넣어도 Veo가 로봇이
정면을 볼 때 하얀 웃는 입을 그렸다(01번 두 번 모두). 원화의 얼굴판은 주황 눈 두 개 말고는 검다 — 그래서 새로 생긴 표시만
얼굴판 색으로 메우면 원화와 같은 얼굴이 된다. 눈·원화에 있던 요소(08번의 입)는 건드리지 않는다.

지우는 것은 원화에 입이 없는 장면에 생긴 입(하얀·빨간)뿐이다. 눈썹으로 분류된 빛(모양이 바뀐 눈일 수 있다)과 원화에 입이 있는 장면은
손대지 않고 보정 뒤 검사에 그대로 남겨 사람이 판단한다.
판정은 얼굴 검사(check-face-elements.py)와 같은 함수를 쓴다. 다만 검사는 «원화 눈 넓이의 15% 이상»만 탈락으로 세지만,
보정은 크기와 상관없이 새 요소를 전부 지운다(입이 나타나고 사라지는 사이의 작은 조각까지). 지운 자리는 둘레 4화소까지 넓혀
빛 번짐까지 덮고, 얼굴판 안에서만, 가장 가까운 얼굴판 화소의 색으로 채운 뒤 그 안에서만 살짝 부드럽게 한다.
눈빛이 안 보이는 프레임(눈 감음·고개 돌림)은 판정을 못 하므로, 앞뒤에서 지운 자리 안의 밝은 표시만 지운다.

보정 뒤에는 반드시 얼굴 검사를 다시 돌려 0프레임인지 보고, 지운 프레임은 사람이 확대해 본다(--compare 전후 그림).
사용: python scripts/media/remove-face-marks.py <장면 01~12> <원본 프레임 폴더> <출력 폴더> [--compare 전후 그림 폴더]
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('out'); ap.add_argument('--compare')
    a = ap.parse_args()
    scene = a.scene.zfill(2)
    regions = json.load(open(os.path.join(HERE, 'face-regions.json'), encoding='utf-8'))[scene]
    art = np.asarray(Image.open(os.path.join(gate.ART_DIR, f'{scene}.png')).convert('RGB'))
    refs = [gate.reference(art, f['face']) for f in regions]
    if any(r is None for r in refs): raise SystemExit(f'기준 오류: 원화 {scene}에서 눈 두 개를 못 찾았다')
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: raise SystemExit(f'프레임 0장: {a.src}')
    os.makedirs(a.out, exist_ok=True)
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
    report = {'frames': len(files), 'fixed': [], 'borrowed': []}
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
    print(f'{len(files)}장 · 지운 프레임 {len(report["fixed"])} · 그중 앞뒤에서 빌린 프레임 {len(report["borrowed"])}')


if __name__ == '__main__':
    main()

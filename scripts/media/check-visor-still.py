"""낱장 그림(캐릭터 기준 그림·키프레임·원화)의 얼굴판에 «주황 눈 두 개» 말고 다른 것이 있는지 검사한다(2026-10-10 Bumm님:
«입이나 이빨 싹 다 지워 버려» — 얼굴판 = 주황 눈 두 개만, 08번만 예외).

check-face-elements.py는 장면별 얼굴 상자(face-regions.json)에서 출발해 영상 프레임을 따라가는 도구라 낱장 그림에는 쓸 수 없다.
그래서 얼굴판을 그림에서 직접 찾고, 판정은 기존 두 도구의 잣대를 그대로 불러 쓴다:
  얼굴판 찾기   눈 짝에서 출발한다. 주황 덩어리(check-face-elements의 warm 기준) 중 가로가 세로의 0.8배 이상인 것(가로로 휜 눈 —
                세로로 긴 귀 원반 테두리는 빠진다) 둘이 넓이 차 2.5배 안·기울기 35도 안·눈 폭의 1.2~5배 거리에 있고 둘 사이가 70% 이상
                검정(얼굴판)이면 한 얼굴의 두 눈이다. 얼굴판 = 두 눈 사이를 지나는 어두운 덩어리(구멍 메움)를 두 눈 둘레 상자로 자른 것이고,
                그 밖은 흰색으로 지운 뒤 판정한다 — 귀 원반·헤드폰·옆 얼굴(엄마·아이)이 얼굴판과 이어져도 그 테두리를 표시로 세지 않는다.
                어두운 덩어리부터 찾으면 귀 원반·크림색 몸의 그늘·갈색 허벅지 반사가 얼굴로 잡혔고(ps-ref-01), 엄마·아이 얼굴판이 한 덩어리가
                되어 아이 눈이 «눈 아닌 것»으로 셌다(ps-ref-23) — 2026-10-10 실측
  밝은 표시     check-face-elements.py의 face_marks·classify — 눈 = 이 그림 자신의 가장 큰 주황 덩어리 둘, 그 밖에 눈썹·입(흰·빨강·
                주황)으로 판정된 것은 전부 탈락. 원화에 있던 종류도 허용하지 않는다(규칙이 «눈 두 개만»이므로). «가려짐»은 사람 확인
  어두운 선     repaint-visor.py 검사 ①과 같은 기준(닫힘 크기 얼굴 높이 × DARK_K, 차이 DARK_C 이상, DARK_N화소 이상, 두께 얼굴 높이 0.15배 이하)
                — 원화의 어두운 미소선도 입으로 본다(2026-10-08 Bumm님). 입 자리(두 눈 축 0.15~0.85, 수직 아래 눈 높이 0.6~4배)만 본다
사용: python scripts/media/check-visor-still.py <그림.png> [...] [--json 결과.json] [--marks 표시그림폴더]
      python scripts/media/check-visor-still.py --selftest   (입·미소선이 있는 옛 원화는 걸리고, 깨끗한 기준 그림은 통과해야 한다)
종료코드 0 통과 · 1 탈락 있음 · 3 탈락은 없고 사람 확인만(눈 짝·얼굴판을 못 찾음, 가려짐) · 2 대상 없음
필요: numpy · scipy · Pillow(scripts/media/ 도구와 같은 격리 환경 .cache/tools/rembg-venv)
"""
import argparse, importlib.util, json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), os.path.join(HERE, name + '.py'))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    return mod


gate, visor = load('check-face-elements'), load('repaint-visor')
EYE_MIN = 0.0002    # 눈 하나의 최소 넓이(그림 넓이 대비) — 1254px 314화소, 704px 99화소. 실측 눈은 704px 237화소 이상, 1254px 아이 로봇 741화소 이상.
                    # 0.00004로 두면 피아노 금색 페달 반사(22~34화소)가 눈 짝으로 잡혀 «입»이 나왔다(07번)
MOUTH_BELOW = (0.6, 4.0)   # 입 자리: 두 눈 축에서 수직 아래로 눈 높이의 0.6~4배
EYE_WIDE = 0.7      # 눈은 가로로 휜 호 — 가로가 세로의 0.7배 이상(비스듬한 얼굴의 먼 눈은 좁아져 0.79였다). 세로로 긴 귀 원반 테두리는 빠진다
EYE_RING = 0.25     # 눈 폭의 0.25배 바깥 띠가 얼굴판 검정인 비율을 잰다. 더 가까이는 눈빛 번짐이라 검지 않다
EYE_DARK = (0.8, 0.25)   # 짝 중 한 눈은 0.8 이상(얼굴판 한가운데), 다른 눈은 0.25 이상(얼굴판 가장자리에 닿은 먼 눈).
                         # 실측(2026-10-10): 정면 눈 0.89~1.0, 비스듬한 얼굴의 먼 눈 0.28~0.64, 몸 그늘·물감·신발 0~0.27(한 짝이 둘 다 높은 경우 없음)
BETWEEN_V = 110     # 두 눈 사이 60% 이상이 이보다 어두워야 한 얼굴판이다(얼굴판 윤기가 눈 사이를 지나 «가장 밝은 채널 < 70»으로는 놓쳤다)


def white_rgb(path):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, 'white'); bg.alpha_composite(im); im = bg
    return np.asarray(im.convert('RGB'))


def eye_pairs(rgb):
    """한 얼굴의 두 눈(왼쪽, 오른쪽) 짝들. 덩어리 하나는 한 짝에만 쓴다(잘 맞는 짝부터)."""
    v = rgb.max(2)
    dark = v < gate.DARK
    lab, _ = ndi.label(gate.warm_mask(rgb))
    comps = []
    for j, sl in enumerate(ndi.find_objects(lab), 1):
        m = lab[sl] == j
        if m.sum() < EYE_MIN * dark.size or m.shape[1] < EYE_WIDE * m.shape[0]: continue
        mm = np.zeros(dark.shape, bool); mm[sl] = m
        r0 = max(1, int(EYE_RING * m.shape[1])); r1 = r0 + max(2, int(0.1 * m.shape[1]))
        ring = ndi.binary_dilation(mm, iterations=r1) & ~ndi.binary_dilation(mm, iterations=r0)
        rd = float(dark[ring].mean())
        if rd < EYE_DARK[1]: continue   # 눈은 검은 얼굴판 안에서 빛난다 — 팔레트 물감·크림색 몸 그늘·신발은 둘레가 검지 않다
        cy, cx = ndi.center_of_mass(m)
        comps.append({'a': int(m.sum()), 'w': m.shape[1], 'x': cx + sl[1].start, 'y': cy + sl[0].start, 'rd': rd,
                      'box': [sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1]})
    cands = []
    for i in range(len(comps)):
        for k in range(i + 1, len(comps)):
            A, B = sorted((comps[i], comps[k]), key=lambda c: c['x'])
            dx, dy = B['x'] - A['x'], B['y'] - A['y']; ew = (A['w'] + B['w']) / 2
            if min(A['a'], B['a']) < 0.4 * max(A['a'], B['a']) or not 1.2 * ew <= np.hypot(dx, dy) <= 5 * ew or abs(dy) > 0.7 * abs(dx): continue
            if max(A['rd'], B['rd']) < EYE_DARK[0]: continue   # 적어도 한 눈은 얼굴판 한가운데에 있다
            t = np.linspace(0.3, 0.7, 21)
            if (v[(A['y'] + t * dy).astype(int), (A['x'] + t * dx).astype(int)] < BETWEEN_V).mean() < 0.6: continue
            cands.append((abs(np.log(A['a'] / B['a'])) + abs(dy) / max(1.0, abs(dx)) + (1 - min(A['rd'], B['rd'])), i, k, A, B))
    used, pairs = set(), []
    for _, i, k, A, B in sorted(cands, key=lambda c: c[0]):
        if i in used or k in used: continue
        used |= {i, k}; pairs.append((A, B))
    return pairs


def visor_crop(rgb, A, B):
    """두 눈 사이를 지나는 얼굴판만 남긴 잘라 낸 그림과 그 상자. 얼굴판 밖은 흰색."""
    span = B['x'] - A['x']; cx, cy = (A['x'] + B['x']) / 2, (A['y'] + B['y']) / 2
    H, W = rgb.shape[:2]
    x0, x1 = max(0, int(cx - 1.4 * span)), min(W, int(cx + 1.4 * span))
    y0, y1 = max(0, int(cy - 1.2 * span)), min(H, int(cy + 1.1 * span))
    crop = rgb[y0:y1, x0:x1]
    lab, _ = ndi.label(ndi.binary_closing(crop.max(2) < gate.DARK, iterations=3))
    k = lab[int(cy) - y0, int(cx) - x0]
    if not k: return None, None
    # 볼록 다각형으로 감싼다 — 구멍 메움만 하면 얼굴판 가장자리에 닿은 눈(구멍이 아님)이 흰색으로 지워져 눈이 하나로 잡혔다(옛 원화 01·02·06번)
    plate = ndi.binary_dilation(gate.hull_mask(lab == k), iterations=2)
    out = np.where(plate[..., None], crop, 255).astype(np.uint8)
    return out, [x0, y0, x1, y1]


def dark_lines(crop, face, eyes):
    """입 자리의 얼굴판보다 어두운 가는 선(미소선·닫힌 입) 화소. 입 자리 = 두 눈 중심을 잇는 축을 따라 0.15~0.85,
    그 축에서 수직 아래로 눈 높이의 MOUTH_BELOW배 사이(고개가 기울어도 같은 기준 — check-face-elements.classify의 «아래»와 같은 잣대).
    «가장 낮은 눈보다 아래 전부»로 보면 기울어진 얼굴(옛 원화 12번)에서 진짜 입 자리를 놓치고 옆의 얼굴판 그늘 띠를 잡았다(2026-10-10 실측)."""
    v = crop.max(2).astype(np.float64); h = face['height']
    keep = ndi.binary_dilation(np.isin(face['labels'], [e['idx'] for e in eyes]), iterations=2)
    k = max(5, int(visor.DARK_K * h) | 1)
    closed = ndi.grey_closing(np.where(keep, 0, v), size=(k, k))
    (ax, ay), (bx, by) = sorted(((e['box'][0] + e['box'][2]) / 2, (e['box'][1] + e['box'][3]) / 2) for e in eyes)
    L = max(1e-6, np.hypot(bx - ax, by - ay)); ux, uy = (bx - ax) / L, (by - ay) / L
    eye_h = sum(e['box'][3] - e['box'][1] + 1 for e in eyes) / 2
    yy, xx = np.mgrid[:v.shape[0], :v.shape[1]]
    along = ((xx - ax) * ux + (yy - ay) * uy) / L
    below = ((xx - ax) * -uy + (yy - ay) * ux) / eye_h
    zone = (along >= 0.15) & (along <= 0.85) & (below >= MOUTH_BELOW[0]) & (below <= MOUTH_BELOW[1])
    d = face['inner'] & ~keep & zone & ((closed - v) >= visor.DARK_C)
    lab, n = ndi.label(d)
    out = np.zeros(d.shape, bool)
    for j, sl in enumerate(ndi.find_objects(lab), 1):
        m = lab[sl] == j
        if m.sum() >= 8 and 2 * visor.thickness(m) <= 0.15 * h: out[sl] |= m
    return out if out.sum() >= visor.DARK_N else np.zeros(d.shape, bool)


def check(path, marks=None):
    rgb = white_rgb(path)
    pairs = eye_pairs(rgb)
    res = {'그림': path, '얼굴판': len(pairs), '탈락': [], '사람확인': []}
    if not pairs: res['사람확인'].append('얼굴판(눈 짝)을 못 찾음'); return res
    im = Image.fromarray(rgb) if marks else None
    for fi, (A, B) in enumerate(pairs, 1):
        crop, box = visor_crop(rgb, A, B)
        face = gate.face_marks(crop) if crop is not None else None
        if face is None: res['사람확인'].append(f'얼굴 {fi}: 두 눈 사이에서 얼굴판을 못 찾음'); continue
        eyes, extras = gate.classify(face, min(A['a'], B['a']))
        if len(eyes) < 2: res['사람확인'].append(f'얼굴 {fi}: 눈이 둘로 안 잡힘'); continue
        other = [c['box'] for P in pairs if P != (A, B) for c in P]   # 옆 얼굴의 눈은 이 얼굴의 표시가 아니다
        def mine(e):
            bx = [e['box'][0] + box[0], e['box'][1] + box[1], e['box'][2] + box[0], e['box'][3] + box[1]]
            return not any(bx[0] <= o[2] and o[0] <= bx[2] and bx[1] <= o[3] and o[1] <= bx[3] for o in other), bx
        found = []
        for e in extras:
            ok, bx = mine(e)
            if ok: found.append({'얼굴': fi, '종류': e['kind'], '넓이': e['area'], '상자': bx})
        res['탈락'] += [f for f in found if f['종류'] != '가려짐']
        res['사람확인'] += [f for f in found if f['종류'] == '가려짐']
        d = dark_lines(crop, face, eyes)
        if d.any():
            ys, xs = np.nonzero(d)
            found.append({'얼굴': fi, '종류': '어두운 선', '넓이': int(d.sum()), '상자': [int(xs.min()) + box[0], int(ys.min()) + box[1], int(xs.max()) + box[0], int(ys.max()) + box[1]]})
            res['탈락'].append(found[-1])
        if im:
            dr = ImageDraw.Draw(im); dr.rectangle(box, outline=(0, 160, 255), width=3)
            for f in found: dr.rectangle([f['상자'][0] - 4, f['상자'][1] - 4, f['상자'][2] + 4, f['상자'][3] + 4], outline=(255, 0, 200), width=3)
    if im:
        os.makedirs(marks, exist_ok=True); im.save(os.path.join(marks, os.path.basename(path)))
    return res


def selftest():
    """입·미소선이 있는 옛 원화(2026-10-01 승인판, face-regions.json의 mouth 자리에 미소선·08번 벌린 입)는 전부 걸려야 하고,
    «눈 두 개만»으로 그린 기준 그림 정면은 통과해야 하며, 그 그림에 그려 넣은 가짜 흰 입·빨간 혀는 걸려야 한다."""
    root = os.path.join(HERE, '..', '..')
    olds = [os.path.join(gate.ART_DIR, f'{n:02d}.png') for n in range(1, 13)]
    clean = os.path.join(root, '.cache', 'seedance-20261010', 'gpt', 'ref', 'ps-ref-01-front.png')
    ok = True
    for p in olds:
        r = check(p); caught = bool(r['탈락'])
        print(f'자기검사 · 옛 원화 {os.path.basename(p)}(미소선·입 있음): {"걸림 " + ",".join(sorted({f["종류"] for f in r["탈락"]})) if caught else "못 잡음 ← 검사 결함"}')
        ok &= caught
    if os.path.exists(clean):
        r = check(clean); passed = not r['탈락'] and not r['사람확인']
        print(f'자기검사 · 깨끗한 기준 그림(ps-ref-01-front): {"통과" if passed else "걸림 ← 검사 결함 " + json.dumps(r, ensure_ascii=False)}')
        ok &= passed
        # 깨끗한 그림의 입 자리(두 눈 축 가운데, 눈 높이 1배 아래 — 옛 원화 미소선 자리)에 가짜 흰 입·빨간 혀·어두운 미소선을 그려 각각 걸리는지 본다
        rgb = white_rgb(clean); A, B = eye_pairs(rgb)[0]
        cx, cy = (A['x'] + B['x']) / 2, (A['y'] + B['y']) / 2; eh = (A['box'][3] - A['box'][1] + B['box'][3] - B['box'][1]) / 2; w = 0.35 * (B['x'] - A['x'])
        my = cy + 1.0 * eh
        fakes = {'흰 입': lambda d: d.arc([cx - w, my - 0.6 * eh, cx + w, my + 0.2 * eh], 20, 160, fill=(250, 250, 250), width=max(4, int(eh / 5))),
                 '빨간 혀': lambda d: d.ellipse([cx - 0.6 * w, my - 0.3 * eh, cx + 0.6 * w, my + 0.3 * eh], fill=(230, 40, 40))}
        # 어두운 미소선은 가짜를 그리지 않는다 — 이 그림의 입 자리 얼굴판 밝기가 7~14라 검은 선을 그려도 사람 눈에도 안 보인다(실측).
        # 그 경우는 위의 옛 원화 12장(진짜 미소선, 둘레 밝기 15~60)이 지킨다
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            for name, draw in fakes.items():
                im = Image.fromarray(rgb.copy()); draw(ImageDraw.Draw(im)); fp = os.path.join(tmp, 'fake.png'); im.save(fp)
                caught = bool(check(fp)['탈락'])
                print(f'자기검사 · 깨끗한 그림 + 가짜 {name}: {"걸림" if caught else "못 잡음 ← 검사 결함"}')
                ok &= caught
    else:
        print('자기검사 · 깨끗한 기준 그림이 없다 — 대상이 없으면 통과가 아니라 실패다'); ok = False
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('images', nargs='*'); ap.add_argument('--json'); ap.add_argument('--marks'); ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest: return selftest()
    if not a.images: print('그림 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    rows = [check(p, a.marks) for p in a.images]
    for r in rows:
        tag = '탈락' if r['탈락'] else ('사람 확인' if r['사람확인'] else '통과')
        detail = ', '.join(f"얼굴 {f['얼굴']} {f['종류']}({f['넓이']}화소)" for f in r['탈락']) or ', '.join(x if isinstance(x, str) else f"얼굴 {x['얼굴']} 가려짐" for x in r['사람확인'])
        print(f"{os.path.basename(r['그림'])}: {tag} · 얼굴판 {r['얼굴판']}{' · ' + detail if detail else ''}")
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as fp: json.dump(rows, fp, ensure_ascii=False, indent=1)
    if any(r['탈락'] for r in rows): return 1
    return 3 if any(r['사람확인'] for r in rows) else 0


if __name__ == '__main__':
    sys.exit(main())

"""Poster Studio 대기 영상 보정 전 점검: 보정한 프레임에 아직 남은 입(하얗거나 회색인 입선·혀·검은 벌린 입)을 찾아
remove-face-marks.py --mouth-frames에 넘길 프레임 구간과, 사람이 고를 확인판을 만든다.

왜(2026-10-08): 표시 지우기(remove-face-marks.py 기본)는 «아주 밝은(200 이상) 입»만 입으로 세서, 덜 밝은 회색 입·흰 입 아래 혀·
검은 벌린 입이 남았다(04번 144번 흰 입, 05번 5.9~7.0초 회색 입, 06번 4.6~5.5초 검은 입). 검사(check-face-elements.py)도 같은
기준이라 이것들을 놓쳤다. 그래서 원화 입 자리를 프레임마다 따라가며 open_mouth(입 자리 모드)가 메울 자리를 찾는지 본다.
원화의 어두운 미소선(밝기 60 안팎)은 찾지 않는다 — 입선은 밝기 120 이상, 검은 입은 둘레의 절반 아래만 센다.

여기서 나온 구간을 그대로 넘기지 않는다: 얼굴 앞을 지나는 빨간 소품(02번 연필 끝)도 혀로 잡히므로, 확인판을 보고 사람이 고른다.
사용: python scripts/media/find-mouth-frames.py <장면 01~12> <프레임 폴더> <확인판 저장 폴더>
출력: 입선·혀 프레임(--line-frames 후보, 확인판에 그림) · 벌린 검은 입 후보(--mouth-frames 후보, 사람이 원본으로 확인)
"""
import glob, importlib.util, json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fix', os.path.join(HERE, 'remove-face-marks.py'))
fix = importlib.util.module_from_spec(spec); spec.loader.exec_module(fix)
gate = fix.gate
MIN_AREA = 12          # 메울 자리가 이보다 작으면 세지 않는다(압축 잡음)


def opened_like_art(region, core):
    """메울 자리가 얼굴 상자 높이의 OPEN_MAX배보다 가늘면 원화 같은 초승달로 보고 세지 않는다."""
    return ndi.distance_transform_edt(region).max() < OPEN_MAX * (core[3] - core[1])


OPEN_MAX = 0.06        # 원화 미소선 메울 자리 두께(반지름)는 얼굴 높이의 5% 안팎, 06번 벌린 입은 8% 넘음


def main():
    scene, src, out = sys.argv[1].zfill(2), sys.argv[2], sys.argv[3]
    regions = json.load(open(os.path.join(HERE, 'face-regions.json'), encoding='utf-8'))[scene]
    art = np.asarray(Image.open(os.path.join(gate.ART_DIR, f'{scene}.png')).convert('RGB'))
    files = sorted(glob.glob(os.path.join(src, '*.png')))
    if not files: raise SystemExit(f'프레임 0장: {src} — 대상이 없으면 통과가 아니라 실패다')
    s = np.asarray(Image.open(files[0])).shape[1] / art.shape[1]
    boxes = [[int(round(c * s)) for c in f['face']] for f in regions]
    os.makedirs(out, exist_ok=True)
    hits, dark_hits, tiles, prev = [], [], [], None
    for i, f in enumerate(files):
        rgb = np.asarray(Image.open(f).convert('RGB')); g = gate.gray(rgb)
        if prev is not None: boxes = [gate.track(prev, g, b) for b in boxes]
        prev = g
        for fi, b in enumerate(boxes):
            big, core = gate.expand(b, rgb.shape)
            crop = rgb[big[1]:big[3], big[0]:big[2]]
            at = [regions[fi]['mouth'][k] * s - regions[fi]['face'][k] * s + b[k] - big[k] for k in (0, 1)]
            # 하얗거나 회색인 입선·혀(--line-frames로 지울 것)를 먼저 본다. 원화 같은 어두운 초승달은 남기는 것이 기준이라 여기서 세지
            # 않고, 원화보다 크게 벌린 검은 입(--mouth-frames로 지울 것)은 따로 센다 — 둘을 섞으면 지운 뒤 다시 훑을 때 원화의 미소선까지
            # «남은 입»으로 나왔다(2026-10-08 실측)
            region, _ = fix.open_mouth(crop, core, at, lines_only=True)
            if region is None or region.sum() < MIN_AREA:
                full, _ = fix.open_mouth(crop, core, at)
                if full is not None and full.sum() >= MIN_AREA and not opened_like_art(full, core): dark_hits.append(i + 1)
                continue
            hits.append(i + 1)
            h = core[3] - core[1]; x, y = int(at[0]), int(at[1])
            show = crop.copy(); edge = ndi.binary_dilation(region, iterations=1) & ~region; show[edge] = (0, 255, 0)
            t = Image.fromarray(show).crop((x - int(0.6 * h), y - int(0.5 * h), x + int(0.6 * h), y + int(0.35 * h))).resize((int(2.4 * h), int(1.7 * h)), Image.NEAREST)
            ImageDraw.Draw(t).text((3, 3), str(i + 1), fill=(255, 0, 0)); tiles.append(t)
            break
    runs = []
    for n in sorted(set(hits)):
        if runs and n == runs[-1][1] + 1: runs[-1][1] = n
        else: runs.append([n, n])
    arg = ','.join(f'{a}-{b}' if a != b else f'{a}' for a, b in runs)
    druns = []
    for n in sorted(set(dark_hits)):
        if druns and n == druns[-1][1] + 1: druns[-1][1] = n
        else: druns.append([n, n])
    darg = ','.join(f'{a}-{b}' if a != b else f'{a}' for a, b in druns)
    for p in range(0, len(tiles), 48):
        sub = tiles[p:p + 48]; W, H = sub[0].size; cols = 8
        c = Image.new('RGB', (cols * (W + 3), ((len(sub) + cols - 1) // cols) * (H + 3)), 'white')
        for k, t in enumerate(sub): c.paste(t, ((k % cols) * (W + 3), (k // cols) * (H + 3)))
        c.save(os.path.join(out, f'{scene}-남은입-{p // 48 + 1}.png'))
    print(f'{scene}: {len(files)}장 · 입선·혀 {len(set(hits))}프레임 --line-frames {arg or "(없음)"} · 벌린 검은 입 후보 {len(set(dark_hits))}프레임 {darg or "(없음)"}')


if __name__ == '__main__':
    main()

"""Poster Studio 대기 영상 검사: 움직이지 않는 소품이 누끼(투명도)에서 잠깐 투명해지는 프레임을 찾는다(2026-10-08, 계획 B).

왜: 10번에서 탁자 오른쪽 가운데가 몇 프레임씩 투명해져 깜박였다(Bumm님 판정 10). 색은 그대로인데 AI 투명도만 흔들린 것이라
그림을 봐서는 안 보이고, 흰 대기 화면 위에 얹었을 때만 보인다. 그래서 «색이 영상 내내 거의 그대로이고(움직이지 않는 곳) 대부분의
프레임에서 불투명한 화소»를 소품으로 보고, 그 화소가 어떤 프레임에서 투명해지면 걸린다. 장면마다 소품 자리를 적지 않아도 된다.
고치기(--fix 새 폴더): 움직이지 않는 불투명 화소(가장자리 포함, 깎지 않음)의 투명도를 영상 내내의 중앙값보다 낮아지지 않게 올려
새 폴더에 쓴다 — 색은 건드리지 않는다. 소품 앞을 무언가 지나가면 그 화소는 색이 바뀌어 «움직이지 않는 곳»이 아니므로 손대지 않는다.
사용: python scripts/media/check-static-alpha.py <프레임 RGB 폴더> <누끼 RGBA 폴더> [--json 결과.json] [--selftest] [--fix 새 폴더]
  --selftest는 10·11·12번 프레임의 소품 화소 한 곳(40×40)을 투명하게 만들어 걸리는지 본다.
종료코드: 0 통과 · 1 걸림(또는 자기검사 놓침) · 2 대상 없음 · 3 움직이지 않는 소품 화소가 0이라 이 검사로는 본 것이 없음(통과가 아님)
"""
import argparse, glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

STILL = 4          # 영상 내내 색 변화(채널별 표준편차의 최대)가 이보다 작으면 움직이지 않는 곳
SOLID = 240        # 그 화소의 투명도 중앙값이 이 이상이면 소품(불투명)
DROP = 200         # 소품 화소의 투명도가 이보다 낮아지면 «투명해짐»
MIN_PX = 30        # 한 프레임에서 투명해진 소품 화소가 이 이상(덩어리로)이면 걸림


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('frames'); ap.add_argument('rgba'); ap.add_argument('--json'); ap.add_argument('--selftest', action='store_true'); ap.add_argument('--fix')
    a = ap.parse_args()
    names = sorted(os.path.basename(f) for f in glob.glob(os.path.join(a.rgba, '*.png')))
    if not names: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    rgb = np.stack([np.asarray(Image.open(os.path.join(a.frames, n)).convert('RGB')) for n in names])
    alpha = np.stack([np.asarray(Image.open(os.path.join(a.rgba, n)).convert('RGBA'))[..., 3] for n in names])
    if rgb.shape[1:3] != alpha.shape[1:3]: print('프레임과 누끼 크기가 다르다', file=sys.stderr); return 2
    still = np.zeros(rgb.shape[1:3], np.float32)
    for c in range(3): still = np.maximum(still, rgb[..., c].astype(np.float32).std(0))
    med = np.median(alpha, 0)
    if a.fix:
        assert not os.path.exists(a.fix), f'출력 폴더가 이미 있다: {a.fix}'
        os.makedirs(a.fix)
        keep = (still < STILL) & (med >= SOLID)
        floor = np.where(keep, med, 0).astype(np.uint8)
        raised = 0
        for i, n in enumerate(names):
            im = np.asarray(Image.open(os.path.join(a.rgba, n)).convert('RGBA')).copy()
            low = im[..., 3] < floor; raised += int(low.sum())
            im[..., 3] = np.maximum(im[..., 3], floor)
            Image.fromarray(im, 'RGBA').save(os.path.join(a.fix, n))
        print(f'고침: 움직이지 않는 불투명 화소 {int(keep.sum())} · 투명도를 올린 화소(프레임 합) {raised} → {a.fix}')
        return 0
    solid = (still < STILL) & (med >= SOLID)
    solid = ndi.binary_erosion(solid, iterations=2)          # 소품 가장자리(원래 반투명한 곳)는 뺀다
    if a.selftest:
        ys, xs = np.nonzero(ndi.binary_erosion(solid, iterations=20))
        if not len(ys): print('자기검사: 소품 화소를 찾지 못했다', file=sys.stderr); return 1
        y, x = ys[len(ys) // 2], xs[len(xs) // 2]
        for i in (9, 10, 11): alpha[i, y - 20:y + 20, x - 20:x + 20] = 0
    rows = []
    for i, n in enumerate(names, 1):
        drop = solid & (alpha[i - 1] < DROP)
        lab, k = ndi.label(drop)
        if not k: continue
        sizes = ndi.sum(drop, lab, range(1, k + 1)); big = np.isin(lab, [j + 1 for j, s in enumerate(sizes) if s >= 8])
        if big.sum() >= MIN_PX:
            ys, xs = np.nonzero(big)
            rows.append({'frame': i, 'px': int(big.sum()), 'box': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
                         'min_alpha': int(alpha[i - 1][big].min())})
    if a.json: json.dump({'solid_px': int(solid.sum()), 'rows': rows}, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    fr = [r['frame'] for r in rows]
    print(f'{len(names)}프레임 · 움직이지 않는 소품 화소 {int(solid.sum())} · 투명해진 프레임 {len(fr)}'
          + (f' · {fr[:20]}{" …" if len(fr) > 20 else ""}' if fr else ''))
    for r in rows[:10]: print(f'  {r["frame"]}번: {r["px"]}화소, 자리 {r["box"]}, 가장 낮은 투명도 {r["min_alpha"]}')
    if not solid.any() and not a.selftest:
        print('  움직이지 않는 소품 화소가 0이다 — 이 영상은 이 검사로 본 것이 없다(통과가 아니다)'); return 3
    if a.selftest:
        got = all(any(r['frame'] == i for r in rows) for i in (10, 11, 12))
        print(f'자기검사 · 일부러 투명하게 만든 10~12번: {"걸림" if got else "놓침"}')
        return 0 if got else 1
    return 1 if rows else 0


if __name__ == '__main__':
    sys.exit(main())

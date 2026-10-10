"""Poster Studio 대기 영상 검사: 움직이지 않는 그림판(02번 바닷마을 그림 등)이 영상 내내 첫 장면(K1) 그대로인지 모든 프레임을 본다(2026-10-08).

왜: 02번 4차 영상에서 3.0~5.0초 동안 그림판 왼쪽 아래(빨간 지붕 집·나무·수레 길)가 색 빠진 스케치로 바뀌었다 돌아왔는데,
세션 체크리스트는 0·4·6·7.9초 표본 네 장만 봐서 «맞음»이라 적었다(팀장 검토 10/8 18:56). 표본 시각이 아니라 모든 프레임을,
손·팔·연필이 덮은 곳만 빼고 첫 장면과 비교한다.

기준: 첫 프레임(K1). 그 프레임에서 손이 가린 곳(첫 프레임과 영상 전체 화소별 중앙값이 다른 덩어리를 원화 팔 다각형 둘레로 한정)은
중앙값으로 채우고, 그 자리는 «볼 수 없는 곳»으로 빼고 넓이를 낸다(손에 가려 기준을 모른다).
손·팔·연필: 기준과 달라진 화소 중 상아색(채도 < 0.2, 밝기 > 110) · 장갑(밝기 < 90) · 파랑·빨강 연필(+6화소 — 연필 나무 끝)을 열고
HAND_GROW화소 넓힌 것(hand_of 설명에 이렇게 정한 까닭과 한계).
바뀐 그림 = 손·볼 수 없는 곳 밖에서, 기준을 ±SHIFT화소 옮겨 가며 가장 작은 차이(5×5 평균 채널 차이 > DIFF)이면서 색 비율도 다른
(> CHROMA — 손 그림자는 색 비율이 같다) 곳을 OPEN화소 열어 MIN_AREA화소 이상 남은 덩어리.
사용: python scripts/media/check-board-static.py <프레임 폴더> --board x,y,x,y,x,y,x,y --polys 다각형.json [--poly-scale 0.5614]
        [--json 결과.json] [--marks 표시그림폴더] [--selftest]
  다각형.json은 compose-keyframe-board.py와 같은 파일({"ref_poly": K1 팔 다각형}, 원화 좌표 — --poly-scale로 프레임 좌표로 줄인다).
  --selftest: 깨끗한 프레임 중 ⓐ 손이 그림판을 가장 덜 가린 프레임의 손과 먼 곳 ⓑ 가장 많이 가린 프레임의 손 바로 옆(4차의 실제 자리),
  그림판에서 색이 짙은 곳을 «베이지로 바랜 연필 스케치»(4차 결함과 같은 종류)로 바꿔 둘 다 걸리는지 본다.
실측(2026-10-08): 4차(그림판이 바뀐 판) 18프레임 걸림(3.25~3.67·4.00·4.50·6.92~7.00초) · 5차 1프레임(113번, 팔이 빠르게 지날 때
종이 흰 테두리가 비는 실제 결함) · 자기검사 ⓐⓑ 걸림.
종료코드: 0 통과 · 1 걸림(또는 자기검사 놓침) · 2 대상 없음
"""
import argparse, glob, json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

DIFF, CHROMA = 25, 0.04   # 채널 차이(결의 떨림 10~20보다 크게) · 색 비율 차이
SHIFT = 2                 # 기준을 ±2화소 옮겨 가며 — 영상 전체가 1화소쯤 흔들리면 뚜렷한 가장자리가 통째로 잡혔다(02번 실측 0~1화소)
OPEN = 2
MIN_AREA = 150
HAND_GROW = 3
PAD = 6                   # 상자 둘레 여유


def poly_mask(shape, polys, scale=1.0):
    m = Image.new('L', (shape[1], shape[0]), 0); d = ImageDraw.Draw(m)
    for p in polys: d.polygon([(float(x) * scale, float(y) * scale) for x, y in p], fill=255)
    return np.asarray(m) > 0


def blur(x): return ndi.uniform_filter(x, (5, 5, 1))


def chroma(x): return x / np.maximum(x.sum(2, keepdims=True), 1)


def hand_of(a, moved, outside):
    """손·팔·연필 = 기준과 달라진 화소(moved) 중 상아색(채도 < 0.2, 밝기 > 110) · 장갑(밝기 < 90) · 파랑·빨강 연필(+6화소 — 연필 나무 끝).
    ⚠ moved로 묶지 않고 색만 보면 그림판의 흰 종이·구름·밝은 물빛까지 상아색이 되어 그림판의 95%가 손이 되었고 검사가 거의 아무것도
    못 봤다(02번 5차 자기검사: 손 넓이 112,044 / 그림판 117,595).
    ⚠ 그림판 밖에서 이어진 덩어리만 손으로 치면 주먹·연필이 팔과 끊겨 «바뀐 그림»으로 잡혔다(02번 5차 33~81프레임) — 쓰지 않는다.
    한계: 색이 빠져 회색·흰색이 된 그림은 손과 색이 같아 손으로 덮인다. 4차의 실제 결함(베이지로 바랜 스케치, 채도 0.41)은 걸린다."""
    v = a.max(2); sat = (v - a.min(2)) / np.maximum(v, 1)
    pencil = (sat > 0.45) & ((((a[..., 2] - a[..., 0]) > 60) & (a[..., 2] > 100)) | (((a[..., 0] - a[..., 1]) > 90) & (a[..., 0] > 140)))
    core = (((sat < 0.2) & (v > 110)) | (v < 90) | ndi.binary_dilation(pencil, iterations=6)) & moved
    return ndi.binary_dilation(ndi.binary_opening(core, iterations=1), iterations=HAND_GROW)


class Board:
    def __init__(self, stack, board, arm1):
        self.board = board; self.inner = ndi.binary_erosion(board, iterations=3)
        med = np.median(stack, axis=0); ref = stack[0].copy()
        d0 = np.abs(blur(ref) - blur(med)).max(2)
        h0 = ndi.binary_fill_holes(ndi.binary_closing(ndi.binary_opening(self.inner & (d0 > DIFF), iterations=OPEN), iterations=3))
        h0 = ndi.binary_dilation(h0, iterations=6) & board & ndi.binary_dilation(arm1, iterations=20)
        ref[h0] = med[h0]
        self.ref = ref
        self.blind = ndi.binary_dilation(h0, iterations=6) & board
        rb = blur(ref)
        self.sh = [np.roll(np.roll(rb, dy, 0), dx, 1) for dy in range(-SHIFT, SHIFT + 1) for dx in range(-SHIFT, SHIFT + 1)]
        self.shc = [chroma(r) for r in self.sh]

    def frame(self, a, want_hand=False):
        ab = blur(a); ac = chroma(ab)
        d = np.min([np.abs(ab - r).max(2) for r in self.sh], axis=0)
        cd = np.min([np.abs(ac - r).max(2) for r in self.shc], axis=0)
        hand = hand_of(a, d > DIFF, ~self.inner)
        bad = ndi.binary_opening(self.inner & (d > DIFF) & (cd > CHROMA) & ~hand & ~self.blind, iterations=OPEN)
        lab, n = ndi.label(bad); sz = ndi.sum(bad, lab, range(1, n + 1)) if n else np.array([])
        keep = [j + 1 for j, s in enumerate(sz) if s >= MIN_AREA]
        out = ([int(sz[j - 1]) for j in keep], np.isin(lab, keep))
        return out + (hand,) if want_hand else out


def runs(nums):
    out = []
    for n in sorted(set(nums)):
        if out and n == out[-1][1] + 1: out[-1][1] = n
        else: out.append([n, n])
    return ' '.join(f'{a}~{b}번({(a - 1) / 24:.2f}~{(b - 1) / 24:.2f}초)' for a, b in out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('--board', required=True); ap.add_argument('--polys', required=True)
    ap.add_argument('--poly-scale', type=float, default=704 / 1254)
    ap.add_argument('--json'); ap.add_argument('--marks'); ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    files = sorted(glob.glob(os.path.join(a.src, '*.png')))
    if not files: print('프레임 0장 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    W, H = Image.open(files[0]).size
    q = list(map(float, a.board.split(','))); board_full = poly_mask((H, W), [list(zip(q[0::2], q[1::2]))])
    arm_full = poly_mask((H, W), json.load(open(a.polys, encoding='utf-8'))['ref_poly'], a.poly_scale)
    if not board_full.any() or not arm_full.any(): print('그림판·팔 다각형이 비었다', file=sys.stderr); return 2
    ys, xs = np.nonzero(board_full)
    y0, y1, x0, x1 = max(0, ys.min() - PAD), min(H, ys.max() + PAD + 1), max(0, xs.min() - PAD), min(W, xs.max() + PAD + 1)
    stack = np.stack([np.asarray(Image.open(f).convert('RGB'))[y0:y1, x0:x1] for f in files]).astype(np.float64)
    B = Board(stack, board_full[y0:y1, x0:x1], arm_full[y0:y1, x0:x1])
    print(f'{len(files)}프레임 · 그림판 {int(B.board.sum())}화소 · 첫 장면에서 손에 가려 볼 수 없는 곳 {int(B.blind.sum())}화소(검사에서 뺌)')

    if a.selftest:
        # 손대기 전 깨끗한 프레임만 쓴다 — ⓐ는 손이 그림판을 가장 덜 가린 프레임, ⓑ는 가장 많이 가린 프레임(4차의 실제 자리: 손 바로 옆)
        res = [B.frame(stack[i], want_hand=True) for i in range(len(files))]
        hands = [int((r[2] & B.board).sum()) for r in res]
        clean = [i for i, r in enumerate(res) if not r[0]]
        if not clean: print('자기검사: 깨끗한 프레임이 없다 — 자기검사를 할 수 없다', file=sys.stderr); return 2
        def sketch(img, cy, cx, r):         # 4차 결함과 같은 «베이지로 바랜 연필 스케치»: 밝기 결은 남기고 색을 종이 베이지(240,215,180)로
            out = img.copy(); yy, xx = np.mgrid[:img.shape[0], :img.shape[1]]
            m = B.board & (np.hypot(yy - cy, xx - cx) <= r)
            lum = img[m].mean(1, keepdims=True) / 255.0
            out[m] = np.array([240.0, 215.0, 180.0]) * (0.55 + 0.45 * lum)
            return out
        # 그릴 자리는 색이 짙은 곳(빨간 지붕·나무처럼) — 원래 색이 옅은 곳(흰 종이·구름)은 색을 빼도 바뀐 게 없어 자기검사가 아니다
        v0 = B.ref.max(2); sat0 = ndi.uniform_filter((v0 - B.ref.min(2)) / np.maximum(v0, 1), 31)
        got = {}
        fa = min(clean, key=lambda i: hands[i]); img = stack[fa]
        hm = res[fa][2] & B.board
        dist = ndi.distance_transform_edt(~hm) if hm.any() else np.full(B.board.shape, 999.0)
        ok = ndi.binary_erosion(B.board, iterations=25) & ~B.blind & (dist >= 30)
        y, x = np.unravel_index(int(np.argmax(np.where(ok, sat0, -1))), dist.shape)
        got[f'ⓐ 손과 먼 곳의 스케치({fa + 1}번)'] = bool(B.frame(sketch(img, y, x, 18))[0])
        fb = max(clean, key=lambda i: hands[i]); img = stack[fb]
        hm = res[fb][2] & B.board
        dist = ndi.distance_transform_edt(~hm)
        ring = ndi.binary_erosion(B.board, iterations=10) & ~B.blind & (dist >= HAND_GROW + 8) & (dist <= HAND_GROW + 14)
        if ring.any():
            ry, rx = np.nonzero(ring); k = int(np.argmax(sat0[ry, rx]))
            got[f'ⓑ 손 바로 옆의 스케치({fb + 1}번)'] = bool(B.frame(sketch(img, ry[k], rx[k], 16))[0])
        else:
            got[f'ⓑ 손 바로 옆의 스케치({fb + 1}번 — 손 둘레에 그릴 자리가 없음)'] = False
        print(f'자기검사: 깨끗한 프레임 {len(clean)}개 중 ⓐ {fa + 1}번(손 넓이 {hands[fa]}) · ⓑ {fb + 1}번(손 넓이 {hands[fb]})')
        for k, v in got.items(): print(f'자기검사 · {k}: {"걸림" if v else "놓침"}')
        return 0 if all(got.values()) else 1

    rows = []
    for i in range(len(files)):
        sizes, mask = B.frame(stack[i])
        rows.append({'frame': i + 1, 'changed': sizes, 'changed_px': int(sum(sizes))})
        if sizes and a.marks:
            os.makedirs(a.marks, exist_ok=True)
            im = np.asarray(Image.open(files[i]).convert('RGB')).copy(); sub = im[y0:y1, x0:x1]
            sub[mask] = (sub[mask] * 0.3 + np.array([255, 0, 255]) * 0.7).astype(np.uint8)
            Image.fromarray(im).save(os.path.join(a.marks, f'{i + 1:03d}.png'))
    bad = [r['frame'] for r in rows if r['changed']]
    print(f'바뀐 그림(손 밖) {len(bad)}프레임 {runs(bad)}')
    if bad: print('  가장 많이 바뀐 프레임: ' + ' · '.join(f'{r["frame"]}번 {r["changed_px"]}화소' for r in sorted(rows, key=lambda r: -r['changed_px'])[:3]))
    if a.json: json.dump(rows, open(a.json, 'w', encoding='utf-8'), ensure_ascii=False)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())

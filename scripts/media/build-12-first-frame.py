"""12번 대기 영상 첫 장면을 원화 화소로 만든다(2026-10-08 Bumm님 판정 12 «조각이 작아 빈칸이 남아 잘못 끼운 것처럼 보임», 팀장 지시 «AI로 그리지 말고 원화 화소를 옮긴다»).

원화(12.png)에서 로봇이 든 꽃 카드(약 128×125)는 끝 장면의 꼭 맞는 조각(125×134)보다 세로가 9화소 짧다. 그래서 영상이 작은 카드를 끼워 빈칸이 남았다.
끝 장면(확정한 새 원화 12-end.png)에는 빈칸에 꼭 맞는 꽃 조각이 끼워져 있다 — 이 조각을 그대로 오려(크기 그대로, 손가락에 가려진
오른쪽 모서리만 둘레 조각 화소로 메움) 원화 카드와 같은 기울기로 돌려 카드 자리에 얹고, 원화의 손가락을 그 위에 다시 얹는다.
빈칸은 원화 그대로(비어 있음). 결과는 «꼭 맞는 크기의 조각을 손에 든» 첫 장면이고, 끝 장면은 12-end.png다.
사용: python scripts/media/build-12-first-frame.py <원화 12.png> <끝 장면 12-end.png> <출력 png> [--check 확인 그림]
"""
import argparse, importlib.util, math, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('fix', os.path.join(HERE, 'remove-face-marks.py'))
fix = importlib.util.module_from_spec(spec); spec.loader.exec_module(fix)

# 1254 원화 좌표(10화소 격자 확대본에서 읽음, 2026-10-08)
TILE = (741, 675, 866, 809)                      # 끝 장면에서 빈칸에 끼워진 조각(왼·위·오·아래) — 오른쪽 866 흰 테두리, 868부터는 판 테두리(갈색)
CARD = {'TL': (787.3, 684.3), 'TR': (913.3, 708.3), 'BL': (765.7, 807.7), 'BR': (891.7, 831.7)}   # 원화 카드 네 꼭짓점
HANDS = [(820, 630, 960, 722), (838, 730, 960, 852)]   # 원화에서 카드를 쥔 두 손(위·아래)이 있는 상자


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('art'); ap.add_argument('end'); ap.add_argument('out'); ap.add_argument('--check')
    a = ap.parse_args()
    O = np.asarray(Image.open(a.art).convert('RGB')).copy(); E = np.asarray(Image.open(a.end).convert('RGB'))
    x0, y0, x1, y1 = TILE
    tile = E[y0:y1, x0:x1].copy()
    v = tile.max(2).astype(int); sat = (tile.max(2).astype(int) - tile.min(2)) / np.maximum(tile.max(2), 1)
    xx = np.arange(x0, x1)[None, :].repeat(y1 - y0, 0)
    hand = (v < 90) | ((xx > 828) & (sat < 0.25) & (v > 120) & (xx < 862))   # 끝 장면에서 조각 오른쪽 모서리를 가린 손가락(크림색 손 포함)
    hand = ndi.binary_dilation(hand, iterations=2)
    tile = fix.harmonic_fill(tile, hand, ~hand)                     # 가려진 곳만 둘레 조각 화소로 메운다(손가락 밑에 다시 들어간다)
    # 카드 기울기로 돌려 오른쪽 위 꼭짓점을 카드의 오른쪽 위 꼭짓점에 맞춘다
    tl, tr = CARD['TL'], CARD['TR']
    ang = math.degrees(math.atan2(tr[1] - tl[1], tr[0] - tl[0]))
    w, h = x1 - x0, y1 - y0
    # 색과 투명도를 따로 돌린다 — RGBA를 한 번에 돌리면 투명한 검정이 섞여 가장자리에 검은 실선이 생겼다
    P = 6
    padded = np.pad(tile, ((P, P), (P, P), (0, 0)), mode='edge')
    mask = np.zeros(padded.shape[:2], np.uint8); mask[P:-P, P:-P] = 255
    rgb_r = Image.fromarray(padded).rotate(-ang, resample=Image.BICUBIC, expand=True)
    a_r = Image.fromarray(mask).rotate(-ang, resample=Image.BILINEAR, expand=True)
    rot = rgb_r.convert('RGBA'); rot.putalpha(a_r)
    c, s = math.cos(math.radians(ang)), math.sin(math.radians(ang))
    corners = np.array([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]])
    R = np.array([[c, -s], [s, c]])
    rc = corners @ R.T + np.array([rot.width / 2, rot.height / 2])     # (패딩은 가운데 기준이라 꼭짓점 계산에 영향 없음)     # 돌린 그림 안의 네 꼭짓점(TL, TR, BR, BL)
    off = np.array(tr) - rc[1]
    canvas = Image.fromarray(O).convert('RGBA')
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); layer.alpha_composite(rot, (int(round(off[0])), int(round(off[1]))))
    out = Image.alpha_composite(canvas, layer)
    # 원화의 손가락을 다시 위에 얹는다: 손 상자 안에서 검은 손가락, 그리고 카드 밖의 크림색 손
    F = np.asarray(out.convert('RGB')).copy()
    card = Image.new('1', canvas.size, 0); ImageDraw.Draw(card).polygon([CARD[k] for k in ('TL', 'TR', 'BR', 'BL')], fill=1)
    card = ndi.binary_dilation(np.asarray(card), iterations=3)
    Ov = O.max(2).astype(int); Os = (O.max(2).astype(int) - O.min(2)) / np.maximum(O.max(2), 1)
    box = np.zeros(Ov.shape, bool)
    for bx0, by0, bx1, by1 in HANDS: box[by0:by1, bx0:bx1] = True
    robot = box & ((Ov < 75) | (~card & (Os < 0.2) & (Ov > 140)))
    robot = ndi.binary_closing(robot, iterations=1)
    F[robot] = O[robot]
    Image.fromarray(F).save(a.out)
    if a.check:
        k = 4; crop = Image.fromarray(F).crop((700, 620, 980, 880)); crop.resize((crop.width * k, crop.height * k), Image.NEAREST).save(a.check)
    print(a.out, '기울기', round(ang, 2), '도 · 조각', w, '×', h)


if __name__ == '__main__':
    main()

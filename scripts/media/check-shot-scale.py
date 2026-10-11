"""만든 영상에서 «화면 자체가 확대·이동했는가»를 잰다 — 대기 영상 품질 기준 Q11(화면 고정).

첫 프레임에서 움직이지 않는 소품(예: 09 흙더미)의 상자를 주면, 일정 간격의 프레임마다 그 소품을
여러 배율로 찾아(정규화 상관) 가장 잘 맞는 배율과 위치를 낸다. 화면이 고정이면 배율 1.00 · 이동 0이다.
09 첫 판(작업 e5bdd295)은 1~6.5초에 화면이 확대됐는데 얼굴 검사·프레임 시트만으로는 숫자가 없었다.

판정은 허용 목록이다: 모든 프레임이 «배율 차 ≤ --tol, 이동 ≤ --shift, 상관 ≥ --min»일 때만 통과.
소품을 못 찾은 프레임(상관 < 0.8 — 확대로 소품이 화면 밖으로 잘린 경우 포함)은 통과가 아니라 실패다.
옛 09에서 2배 넘게 확대된 프레임은 엉뚱한 자리가 상관 0.62~0.69로 잡혔다 — 진짜 소품은 0.88 이상이었다.

움직이지 않는 소품이 없는 장면(예: 11 — 흰 바탕에 두 로봇만)은 --track으로 캐릭터의 단단한 부분(머리)을 준다.
그때는 위치가 움직이는 것이 당연하므로 이동은 재기만 하고 판정하지 않으며, 배율만 본다. 머리가 돌아 못 찾은 프레임은
그대로 실패로 남긴다 — 그 프레임은 사람이 프레임 시트로 본다.

사용: python scripts/media/check-shot-scale.py <영상> <x0,y0,x1,y1> [--step 6] [--tol 0.04] [--shift 0.03] [--min 0.8] [--track]
      상자는 원본 영상 화소 기준(첫 프레임). 파이썬은 scipy가 있는 .cache/tools/rembg-venv를 쓴다.
종료: 0 = 고정 · 1 = 확대·이동이 있거나 못 찾은 프레임이 있음 · 2 = 입력 오류(영상 없음·프레임 0개·상자가 화면 밖)
"""
import json
import subprocess
import sys

import numpy as np
from PIL import Image
from scipy.signal import fftconvolve

WORK = 480  # 이 너비로 줄여서 잰다(960 영상이면 절반)
SCALES = np.round(np.arange(0.6, 2.0001, 0.025), 3)


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
                          '-of', 'json', path], capture_output=True, text=True)
    if out.returncode != 0: return None
    s = json.loads(out.stdout)['streams'][0]
    return s['width'], s['height']


def frames(path, step, w, h):
    """step 프레임마다 회색조로 줄인 프레임을 (번호, 배열)로 낸다."""
    vf = f"select=not(mod(n\\,{step})),scale={w}:{h},format=gray"
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', vf, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-'],
                       capture_output=True)
    buf = np.frombuffer(p.stdout, np.uint8)
    n = len(buf) // (w * h)
    return [(i * step, buf[i * w * h:(i + 1) * w * h].reshape(h, w).astype(np.float64)) for i in range(n)]


def winsum(a, h, w):
    c = np.pad(a.cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    return c[h:, w:] - c[:-h, w:] - c[h:, :-w] + c[:-h, :-w]


def best_match(img, tpl0):
    """여러 배율로 줄이고 늘린 소품을 찾아 (상관, 배율, x, y) 가운데 상관이 가장 큰 것."""
    best = (-2.0, 1.0, 0, 0)
    for s in SCALES:
        th, tw = round(tpl0.shape[0] * s), round(tpl0.shape[1] * s)
        if th < 8 or tw < 8 or th > img.shape[0] or tw > img.shape[1]: continue
        t = np.asarray(Image.fromarray(tpl0).resize((tw, th), Image.BILINEAR), np.float64)
        t = t - t.mean(); tn = np.sqrt((t * t).sum())
        if tn == 0: continue
        num = fftconvolve(img, t[::-1, ::-1], mode='valid')
        s1, s2 = winsum(img, th, tw), winsum(img * img, th, tw)
        den = np.sqrt(np.maximum(s2 - s1 * s1 / (th * tw), 1e-6)) * tn
        ncc = num / den
        y, x = np.unravel_index(np.argmax(ncc), ncc.shape)
        if ncc[y, x] > best[0]: best = (float(ncc[y, x]), float(s), int(x), int(y))
    return best


def main(argv):
    opts = {'--step': 6, '--tol': 0.04, '--shift': 0.03, '--min': 0.8}
    track = False
    pos = []
    it = iter(argv)
    for a in it:
        if a == '--track': track = True
        elif a in opts: opts[a] = type(opts[a])(next(it))
        else: pos.append(a)
    if len(pos) != 2: print(__doc__); return 2
    video, box = pos
    size = probe(video)
    if not size: print(f'영상을 읽지 못함: {video}'); return 2
    W, H = size
    x0, y0, x1, y1 = (int(v) for v in box.split(','))
    if not (0 <= x0 < x1 <= W and 0 <= y0 < y1 <= H): print(f'상자가 화면 밖: {box} (화면 {W}×{H})'); return 2
    f = WORK / W; w, h = WORK, round(H * f)
    fr = frames(video, opts['--step'], w, h)
    if not fr: print('프레임 0개'); return 2
    bx0, by0, bx1, by1 = round(x0 * f), round(y0 * f), round(x1 * f), round(y1 * f)
    tpl0 = fr[0][1][by0:by1, bx0:bx1].astype(np.float32)
    cx0, cy0 = (bx0 + bx1) / 2, (by0 + by1) / 2
    bad = []
    print(f'{video} · 소품 상자 {box} · {len(fr)}프레임({opts["--step"]}프레임마다) · 기준: 배율 차 ≤ {opts["--tol"]}, 이동 ≤ {opts["--shift"]:.0%}{" (--track: 이동은 판정하지 않음)" if track else ""}, 상관 ≥ {opts["--min"]}')
    print('번호   초     배율   이동    상관')
    for n, img in fr:
        peak, s, x, y = best_match(img, tpl0)
        th, tw = tpl0.shape[0] * s, tpl0.shape[1] * s
        shift = float(np.hypot(x + tw / 2 - cx0, y + th / 2 - cy0)) / w
        why = []
        if peak < opts['--min']: why.append('못 찾음')
        else:
            if abs(s - 1) > opts['--tol']: why.append('확대' if s > 1 else '축소')
            if shift > opts['--shift'] and not track: why.append('이동')
        if why: bad.append((n, why))
        print(f'{n:4d} {n / 24:5.2f} {s:6.3f} {shift:6.1%} {peak:6.3f}  {"· ".join(why)}')
    if bad:
        print(f'판정: 실패 — {len(bad)}/{len(fr)}프레임 ({bad[0][0] / 24:.2f}~{bad[-1][0] / 24:.2f}초)')
        return 1
    print(f'판정: 통과 — {len(fr)}프레임 모두 화면 고정')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

# 가장자리 흔들림을 잰다(결정 119의 근거가 된 측정 — 04번 192프레임).
#  소품(scenes.json의 poster가 있는 장면만): 오른쪽·위·아래 가장자리를 줄마다 «불투명도 50%가 되는 자리»(소수 화소)와
#    «반투명 폭»(0.05~0.95인 화소 수)으로 잰다.
#    · 위치 떨림 = 9프레임 이동 평균에서 벗어난 정도(실제 움직임은 부드럽고, 누끼 잡음은 프레임마다 튄다)
#    · 폭 튐 = 가장자리 평균 반투명 폭이 앞뒤 9프레임 중앙값보다 0.5화소 넘게 다른 프레임
#    · 종이 띠 두께 = 바깥 경계(불투명도 0.5) − 안쪽 그림 끝(크림색이 끝나는 곳) — Bumm님이 보신 «선 두께»
#    · 그림자(검정 화소)는 가장자리 측정에서 뺀다
#  캐릭터: (소품 둘레 8화소를 뺀) 가장자리 띠에서 앞 프레임과 색이 거의 같은(움직이지 않는) 화소의 불투명도 변화
#  윤곽 보존: 불투명 넓이(합)와 흰 바탕 재합성 차이(원본 프레임 대비)
# 사용: python edge_metrics.py <장면 01~12> <원본 RGB 폴더> <결과 RGBA 폴더> [<결과 RGBA 폴더> ...]  → 각 폴더 옆에 <폴더>.edge-metrics.json
import glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SPIKE = 0.5


def crossings(a, lines, axis, lo, hi, outward):
    """선마다 안쪽(소품)에서 바깥으로 갈 때 불투명도 0.5를 지나는 소수 위치와 반투명 폭."""
    pos, width = [], []
    for l in lines:
        prof = a[l, lo:hi] if axis == 'row' else a[lo:hi, l]
        if outward < 0: prof = prof[::-1]
        idx = np.flatnonzero(prof >= 0.5)
        if not len(idx): pos.append(np.nan); width.append(np.nan); continue
        i = idx[-1]
        if i + 1 < len(prof): p = i + (prof[i] - 0.5) / max(prof[i] - prof[i + 1], 1e-6)
        else: p = float(i)
        pos.append(p); width.append(float(((prof > 0.05) & (prof < 0.95)).sum()))
    return np.array(pos), np.array(width)


def poster_alpha(rgba):
    a = rgba[..., 3].astype(np.float64) / 255.0
    a[rgba[..., :3].max(2) <= 10] = 0          # 검정 그림자는 가장자리로 세지 않는다
    return a


def analyze(src, dir_rgba, poster):
    names = [os.path.basename(f) for f in sorted(glob.glob(os.path.join(dir_rgba, '*.png')))]
    if not names: raise SystemExit(f'프레임이 없다: {dir_rgba}')
    R, T, B, RW, TW, BW, flick, big, area, recon, RIM = [], [], [], [], [], [], [], 0, [], [], []
    shape = np.asarray(Image.open(os.path.join(dir_rgba, names[0]))).shape[:2]
    ring = np.zeros(shape, bool)
    if poster:
        m = poster['metrics']
        RIGHT_ROWS = range(*m['right']['rows']); TOP_COLS = range(*m['top']['cols']); BOTTOM_COLS = range(*m['bottom']['cols'])
        rl, rh = m['right']['window']; tl, th_ = m['top']['window']; bl, bh = m['bottom']['window']
        zone = np.zeros(shape, bool); zone[slice(*m['zone']['rows']), slice(*m['zone']['cols'])] = True
        ring = ndi.binary_dilation(zone, iterations=8) & ~ndi.binary_erosion(zone, iterations=8)
    prev = prev_rgb = None
    for n in names:
        rgba = np.asarray(Image.open(os.path.join(dir_rgba, n))).astype(np.int32)
        rgb = np.asarray(Image.open(os.path.join(src, n)).convert('RGB')).astype(np.int32)
        if poster:
            a = poster_alpha(rgba)
            r, rw = crossings(a, RIGHT_ROWS, 'row', rl, rh, +1); R.append(r); RW.append(rw)
            c = rgba[..., :3].astype(np.float64); v = c.max(2); sat = (v - c.min(2)) / np.maximum(v, 1)
            th = []
            for k, y in enumerate(RIGHT_ROWS):
                if k % 2 or np.isnan(r[k]): continue
                x = int(rl + r[k])
                while x > rl - 10 and sat[y, x] < 0.3 and v[y, x] > 150: x -= 1
                th.append(rl + r[k] - x)
            RIM.append(float(np.mean(th)))
            t, tw = crossings(a, TOP_COLS, 'col', tl, th_, -1); T.append(t); TW.append(tw)
            b, bw = crossings(a, BOTTOM_COLS, 'col', bl, bh, +1); B.append(b); BW.append(bw)
        al = rgba[..., 3]
        area.append(int(al.sum() / 255))
        back = rgba[..., :3] * (al[..., None] / 255.0) + (1 - al[..., None] / 255.0) * 255
        recon.append(float(np.abs(back - rgb).mean()))
        if prev is not None:
            still = np.abs(rgb - prev_rgb).max(2) < 8
            band = (((al > 5) & (al < 250)) | ((prev > 5) & (prev < 250))) & ~ring
            d = np.abs(al - prev)[still & band]
            flick.append(float(d.mean()) if d.size else 0.0); big += int((d > 64).sum())
        prev, prev_rgb = al, rgb
    out = {'frames': len(names)}
    if poster:
        for key, P, Wd in (('오른쪽', R, RW), ('위', T, TW), ('아래', B, BW)):
            P = np.array(P); Wd = np.array(Wd)
            smooth = ndi.uniform_filter1d(np.nan_to_num(P, nan=np.nanmean(P)), 9, axis=0, mode='nearest')
            jitter = np.nanmean(np.abs(P - smooth))                         # 프레임마다 튀는 위치(화소)
            mw = np.nanmean(Wd, axis=1)                                      # 프레임별 평균 반투명 폭
            med = ndi.median_filter(mw, size=9, mode='nearest')
            spikes = [int(i + 1) for i in np.flatnonzero(np.abs(mw - med) > SPIKE)]
            out[key] = {'위치떨림_화소': round(float(jitter), 3), '반투명폭_평균': round(float(np.nanmean(mw)), 2),
                        '반투명폭_프레임간변화': round(float(np.mean(np.abs(np.diff(mw)))), 3), '폭튐프레임': spikes}
        Rm = np.nanmean(np.array(R), axis=1) + rl
        rims = np.array(RIM)
        jumps = [int(i + 2) for i in np.flatnonzero(np.abs(np.diff(Rm)) > 0.5)]
        out['포스터_종이띠'] = {'두께_평균': round(float(rims.mean()), 2), '두께_최소': round(float(rims.min()), 2), '두께_최대': round(float(rims.max()), 2),
                           '두께_프레임간변화_평균': round(float(np.mean(np.abs(np.diff(rims)))), 3),
                           '두께가_0.4화소넘게_튄_프레임': [int(i + 2) for i in np.flatnonzero(np.abs(np.diff(rims)) > 0.4)],
                           '바깥경계가_0.5화소넘게_뛴_프레임': jumps}
    out['캐릭터'] = {'가장자리_불투명도변화_평균': round(float(np.mean(flick)), 2), '크게바뀐화소_합': big}
    out['보존'] = {'불투명넓이_평균': int(np.mean(area)), '흰바탕재합성차이_평균': round(float(np.mean(recon)), 3)}
    return out


if __name__ == '__main__':
    scene, src, dirs = sys.argv[1], sys.argv[2], sys.argv[3:]
    scenes = json.load(open(os.path.join(HERE, 'scenes.json'), encoding='utf-8'))
    if scene not in scenes or not dirs: raise SystemExit('사용: python edge_metrics.py <장면 01~12> <원본 RGB 폴더> <결과 RGBA 폴더> [...]')
    for d in dirs:
        res = analyze(src, d, scenes[scene]['poster'])
        json.dump(res, open(os.path.join(d, '..', os.path.basename(d.rstrip('/')) + '.edge-metrics.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(os.path.basename(d.rstrip('/')), json.dumps(res, ensure_ascii=False))

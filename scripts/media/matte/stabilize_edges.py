# 가장자리 안정화(2026-10-06 Bumm님 결정 119 — 12편 기준). 다듬은 프레임(refine_frames 결과)을 받아 최종 프레임을 만든다.
#  · 움직이지 않는 화소: 앞뒤 프레임 투명도의 중앙값
#  · 가장자리 띠(불투명도 0.02~0.98): 앞뒤 2프레임을 «색이 비슷할수록 크게» 가중 평균 — 같은 자리가 가만히 있으면 섞이고,
#    움직여서 색이 달라지면 거의 안 섞인다(움직인 곳은 건드리지 않는다)
#  · 흰 테두리 소품(scenes.json의 poster가 있는 장면만): 소품 그림 안쪽을 위상 상관으로 소수 화소까지 추적 → 7프레임으로 부드럽게 →
#    원화 꼭짓점을 그만큼 옮겨 고정 직선으로 그린다(8×8 표본). 직선 바깥 6화소 안의 크림·흰 부스러기는 지운다(그림자·손가락처럼 어두운 것은 둔다).
#    정수 화소로 꼭짓점을 옮기면 1화소씩 툭 뛰어 «선이 울컥 두꺼워진다»(04번 실측 5프레임) — 그래서 소수 화소로 추적한다.
#  반투명 폭 제한은 쓰지 않는다(깜박임이 늘었다).
# 사용: python stabilize_edges.py <장면 01~12> <원본 RGB 폴더> <다듬은 RGBA 폴더> <출력 폴더>
import argparse, glob, json, os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
STILL_MOTION = 8   # 앞뒤 프레임과 색 차이(0~255 최댓값)가 이보다 작으면 움직이지 않는 화소로 본다
SS = 8


def load_scene(scene):
    scenes = json.load(open(os.path.join(HERE, 'scenes.json'), encoding='utf-8'))
    if scene not in scenes: raise SystemExit(f'scenes.json에 장면 {scene}이 없다')
    return scenes[scene]


def edges(rgb, cfg):
    """소품의 오른쪽·위·아래 가장자리(색이 있는 화소가 끝나는 자리)를 여러 줄에서 재 중앙값을 낸다."""
    o = rgb.astype(int); col = (o.max(2) - o.min(2)) > 40
    r, t, b = cfg['right'], cfg['top'], cfg['bottom']
    R = np.median([max(x for x in range(*r['scan']) if col[y, x]) for y in range(*r['rows']) if col[y, r['scan'][0]:r['scan'][1]].any()])
    T = np.median([min(y for y in range(*t['scan']) if col[y, x]) for x in range(*t['cols']) if col[t['scan'][0]:t['scan'][1], x].any()])
    B = np.median([max(y for y in range(*b['scan']) if col[y, x]) for x in range(*b['cols']) if col[b['scan'][0]:b['scan'][1], x].any()])
    return np.array([R, T, B])


def coverage(shape, pts):
    big = Image.new('L', (shape[1] * SS, shape[0] * SS), 0)
    ImageDraw.Draw(big).polygon([((x + 0.5) * SS, (y + 0.5) * SS) for x, y in pts], fill=255)
    return np.asarray(big.resize((shape[1], shape[0]), Image.BOX), dtype=np.float64) / 255.0


def phase_shift(ref, cur):
    """cur가 ref에서 얼마나 옮겨졌나(dy, dx) — 위상 상관 + 꼭대기 포물선 맞춤으로 소수 화소까지."""
    win = np.outer(np.hanning(ref.shape[0]), np.hanning(ref.shape[1]))
    F = np.fft.fft2((ref - ref.mean()) * win); G = np.fft.fft2((cur - cur.mean()) * win)
    R = G * np.conj(F); R /= np.maximum(np.abs(R), 1e-9)
    c = np.fft.fftshift(np.real(np.fft.ifft2(R)))
    y, x = np.unravel_index(np.argmax(c), c.shape)
    def sub(m1, m0, p1): d = m1 - 2 * m0 + p1; return 0.0 if d == 0 else 0.5 * (m1 - p1) / d
    dy = sub(c[y - 1, x], c[y, x], c[y + 1, x]); dx = sub(c[y, x - 1], c[y, x], c[y, x + 1])
    return y + dy - c.shape[0] // 2, x + dx - c.shape[1] // 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('scene'); ap.add_argument('src'); ap.add_argument('ref'); ap.add_argument('out')
    a = ap.parse_args()
    poster = load_scene(a.scene)['poster']
    os.makedirs(a.out, exist_ok=True)
    names = [os.path.basename(f) for f in sorted(glob.glob(os.path.join(a.src, '*.png')))]
    if not names: raise SystemExit(f'프레임이 없다: {a.src}')
    rgb = np.stack([np.asarray(Image.open(os.path.join(a.src, n)).convert('RGB')) for n in names]).astype(np.int16)
    ref = np.stack([np.asarray(Image.open(os.path.join(a.ref, n))) for n in names])
    al = ref[..., 3].astype(np.float32)
    T, H, W_ = al.shape
    # 1) 움직이지 않는 화소: 앞뒤 프레임 중앙값
    out_a = al.copy()
    for i in range(1, T - 1):
        still = (np.abs(rgb[i] - rgb[i - 1]).max(2) < STILL_MOTION) & (np.abs(rgb[i] - rgb[i + 1]).max(2) < STILL_MOTION)
        med = np.median(al[i - 1:i + 2], 0); out_a[i][still] = med[still]
    # 2) 가장자리 띠의 색 가중 시간 평균
    sm = out_a.copy()
    for i in range(T):
        ks = [k for k in range(i - 2, i + 3) if 0 <= k < T]
        band = np.zeros(al.shape[1:], bool)
        for k in ks: band |= (out_a[k] > 5) & (out_a[k] < 250)
        band &= ref[i, ..., :3].max(2) > 10          # 검정 그림자는 그대로
        num = np.zeros(band.sum()); den = np.zeros(band.sum())
        for k in ks:
            d2 = ((rgb[k][band] - rgb[i][band]).astype(np.float32) ** 2).sum(1)
            w = np.exp(-d2 / (2 * 12.0 ** 2)); num += w * out_a[k][band]; den += w
        sm[i][band] = num / den
    out_a = sm
    if poster is None:
        for i, n in enumerate(names):
            o = ref[i].copy(); o[..., 3] = np.clip(out_a[i].round(), 0, 255).astype(np.uint8)
            Image.fromarray(o, 'RGBA').save(os.path.join(a.out, n))
        print(f'{T}장 · 장면 {a.scene} · 소품 보정 없음')
        return
    # 3) 흰 테두리 소품
    POLY = np.array(poster['poly'], float)
    TRACK = (slice(*poster['track']['rows']), slice(*poster['track']['cols']))
    HAND_X = poster['hand_x']
    base = edges(np.asarray(Image.open(os.path.join(ROOT, load_scene(a.scene)['art'])).convert('RGB')), poster['edges'])
    g = rgb.astype(np.float64) @ [0.299, 0.587, 0.114]
    ref0 = g[0][TRACK]
    tr = np.array([phase_shift(ref0, g[i][TRACK]) for i in range(T)])
    tr = ndi.uniform_filter1d(tr, 7, axis=0, mode='nearest')
    e0 = edges(rgb[0].astype(np.uint8), poster['edges']) - base           # 첫 장면과 원화 사이(한 번만 재는 상수)
    shift = np.stack([e0[0] + tr[:, 1], e0[1] + tr[:, 0], e0[2] + tr[:, 0]], 1)
    yy, xx = np.mgrid[0:H, 0:W_]
    for i, n in enumerate(names):
        dR, dT, dB = shift[i]
        p = POLY.copy(); p[0, 1] += dT; p[1, 1] += dT; p[1, 0] += dR; p[2, 0] += dR; p[2, 1] += dB; p[3, 1] += dB
        cov = coverage((H, W_), p)
        A = out_a[i] / 255.0; C = rgb[i].astype(np.float64); F = ref[i, ..., :3].astype(np.float64)
        # 직선 바깥 6화소 안의 크림·흰 부스러기를 지운다(오른쪽·아래 전체, 위는 손가락 구간 제외). 왼쪽은 캐릭터와 겹쳐 손대지 않는다
        v = C.max(2); sat = (v - C.min(2)) / np.maximum(v, 1)
        near = ndi.binary_dilation(cov > 0, iterations=6) & (cov == 0)
        zone = near & (xx >= p[0, 0] + 20) & ~((xx >= HAND_X[0]) & (xx <= HAND_X[1]) & (yy < p[0, 1] + 10))
        crumb = zone & (v >= 150) & (sat < 0.3) & (F.max(2) > 10)
        A[crumb] = 0
        take = cov > A
        W = 255.0
        Fp = np.clip(W + (C - W) / np.maximum(cov, 1e-3)[..., None], 0, 255); Fp[cov >= 0.999] = C[cov >= 0.999]
        A = np.where(take, cov, A); F = np.where(take[..., None], Fp, F)
        o = np.dstack([np.clip(F.round(), 0, 255), np.clip((A * 255).round(), 0, 255)]).astype(np.uint8)
        Image.fromarray(o, 'RGBA').save(os.path.join(a.out, n))
    print(f'{T}장 · 장면 {a.scene} · 소품 이동 범위 오른쪽 {shift[:, 0].min():+.2f}~{shift[:, 0].max():+.2f} 위 {shift[:, 1].min():+.2f}~{shift[:, 1].max():+.2f} 아래 {shift[:, 2].min():+.2f}~{shift[:, 2].max():+.2f}')


if __name__ == '__main__':
    main()

"""대기 영상 키프레임 «통일성 점검»(2026-10-10 Bumm님 원칙 «그림들은 통일성을 완벽하게 가진다»).

편마다 키프레임을 같은 크기(704)로 맞춰 첫 그림(원화)과 견준다 — 사람이 같은 크기로 나란히 보는 대조표에 숫자를 붙이는 도구다.
  배경 밝기·색온도   테두리 3% 띠의 평균 L*·b*(색온도: b*가 클수록 노랗다) — 원화와의 차
  화면 속 크기·위치  흰 바탕이 아닌 것(L* < 92)을 감싸는 상자의 가로·세로·가운데(화면 대비 %) — 카메라 거리·구도
  선명도            회색조 라플라시안 분산의 원화 대비 배율 — 선 굵기·흐림
  몸체 크림색        밝고(L* > 75) 채도 낮은(C* 4~25) 화소의 평균 Lab, 원화와의 ΔE
  눈 빛 색          빛나는 주황 화소(R > 210, 110 < G < 210, B < 130)의 평균 Lab, 원화와의 ΔE
  색 분포           RGB 8×8×8 히스토그램 겹침(1 = 같음)
기준을 넘은 값은 «사람 확인»으로 표시한다(자세가 바뀌면 크기·가운데는 정당하게 달라질 수 있으므로 자동 탈락이 아니다).
입력: <검토 폴더>/keyframes.json {"scenes": [{"id", "title", "items": [{"label", "image"}]}]} — items[0]이 원화, image는 검토 폴더 기준
출력: <검토 폴더>/kf-uniformity.json {scene_id: [{"label", 지표..., "확인": [넘은 항목]}]}
사용: python scripts/media/keyframe-uniformity.py <검토 폴더>   종료코드 0 · 2 대상 없음
"""
import json, os, sys
import numpy as np
from PIL import Image

LIMITS = {'배경밝기차': 2.0, '배경색온도차': 2.0, '크기변화%': 10.0, '가운데이동%': 5.0, '몸체ΔE': 5.0, '눈빛ΔE': 8.0, '색분포겹침': 0.85}


def lab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def measure(path):
    im = Image.open(path)
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3]); im = bg
    rgb = np.asarray(im.convert('RGB').resize((704, 704), Image.LANCZOS))
    L = lab(rgb)
    b = 21  # 3% 띠
    band = np.concatenate([L[:b].reshape(-1, 3), L[-b:].reshape(-1, 3), L[:, :b].reshape(-1, 3), L[:, -b:].reshape(-1, 3)])
    fg = L[..., 0] < 92
    ys, xs = np.nonzero(fg)
    box = (xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) else (0, 0, 703, 703)
    g = np.asarray(im.convert('L').resize((704, 704), Image.LANCZOS), dtype=np.float64)
    lap = g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]
    C = np.hypot(L[..., 1], L[..., 2])
    shell = (L[..., 0] > 75) & (C > 4) & (C < 25) & fg
    r, gg, bb = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    eye = (r > 210) & (gg > 110) & (gg < 210) & (bb < 130)
    hist = np.histogramdd(rgb.reshape(-1, 3) // 32, bins=(8, 8, 8), range=((0, 8),) * 3)[0].ravel()
    return {'배경L': float(band[:, 0].mean()), '배경b': float(band[:, 2].mean()),
            '가로%': (box[2] - box[0]) / 7.04, '세로%': (box[3] - box[1]) / 7.04,
            '가운데x%': (box[0] + box[2]) / 14.08, '가운데y%': (box[1] + box[3]) / 14.08,
            '선명도': float(lap.var()), '몸체': L[shell].mean(0) if shell.any() else None,
            '눈빛': L[eye].mean(0) if eye.sum() > 20 else None, '눈빛화소': int(eye.sum()), 'hist': hist / hist.sum()}


def main():
    if len(sys.argv) < 2: print(__doc__); return 2
    out = os.path.abspath(sys.argv[1])
    p = os.path.join(out, 'keyframes.json')
    if not os.path.exists(p): print('keyframes.json 없음 — 대상이 없으면 통과가 아니라 실패다', file=sys.stderr); return 2
    scenes = json.load(open(p, encoding='utf-8'))['scenes']
    if not scenes: print('편 0개', file=sys.stderr); return 2
    res = {}
    for sc in scenes:
        ms = [measure(os.path.join(out, it['image'])) for it in sc['items']]
        base = ms[0]
        rows = []
        for it, m in zip(sc['items'], ms):
            dE = lambda a, b_: None if a is None or b_ is None else round(float(np.sqrt(((a - b_) ** 2).sum())), 1)
            row = {'label': it['label'],
                   '배경밝기차': round(m['배경L'] - base['배경L'], 2), '배경색온도차': round(m['배경b'] - base['배경b'], 2),
                   '크기변화%': round(max(abs(m['가로%'] - base['가로%']) / base['가로%'], abs(m['세로%'] - base['세로%']) / base['세로%']) * 100, 1),
                   '가운데이동%': round(float(np.hypot(m['가운데x%'] - base['가운데x%'], m['가운데y%'] - base['가운데y%'])), 1),
                   '선명도배율': round(m['선명도'] / base['선명도'], 2),
                   '몸체ΔE': dE(m['몸체'], base['몸체']), '눈빛ΔE': dE(m['눈빛'], base['눈빛']), '눈빛화소': m['눈빛화소'],
                   '색분포겹침': round(float(np.minimum(m['hist'], base['hist']).sum()), 3)}
            flags = [k for k in ('배경밝기차', '배경색온도차') if abs(row[k]) > LIMITS[k]]
            flags += [k for k in ('크기변화%', '가운데이동%') if row[k] > LIMITS[k]]
            flags += [k for k in ('몸체ΔE', '눈빛ΔE') if row[k] is not None and row[k] > LIMITS[k]]
            if row['색분포겹침'] < LIMITS['색분포겹침']: flags.append('색분포겹침')
            if not 0.6 <= row['선명도배율'] <= 1.67: flags.append('선명도배율')
            row['확인'] = flags
            rows.append(row)
        res[sc['id']] = rows
        print(sc['id'], [(r['label'], r['확인']) for r in rows], flush=True)
    json.dump(res, open(os.path.join(out, 'kf-uniformity.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())

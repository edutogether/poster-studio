"""대기 영상 키프레임을 원화에 맞춘다 — Seedance에 넣기 전(2026-10-10 Bumm님 결정 2·3, 크레딧 0, 원화는 그대로).

1. 크기: 원화와 같은 704×704로 줄인다(LANCZOS).
2. 선명도: ChatGPT 키프레임(1254)이 704 원화보다 1.2~3.3배 선명했다. 가우스 흐림 반경을 0~3 사이에서 찾아
   회색조 라플라시안 분산이 원화와 가장 가까운 값으로 흐린다(keyframe-uniformity.py와 같은 잣대).
3. 눈 빛 색: 빛나는 주황 화소(R > 210, 110 < G < 210, B < 130)와 그 둘레 3화소 번짐만, 평균 Lab이 원화 눈 빛 평균과 같아지도록
   Lab 값을 옮긴다(가장자리는 부드럽게 섞음). 눈이 아닌 곳은 화소 하나도 바꾸지 않는다.
사용: python scripts/media/keyframe-match.py <원화.png> <출력 폴더> <키프레임.png> [...]
      → <출력 폴더>/<같은 이름>.png + 전/후 수치(선명도 배율·눈 빛 ΔE)를 출력. 종료코드 0 · 2 대상 없음
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

EYE = lambda rgb: (rgb[..., 0] > 210) & (rgb[..., 1] > 110) & (rgb[..., 1] < 210) & (rgb[..., 2] < 130)
M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
WHITE = np.array([0.95047, 1.0, 1.08883])


def to_lab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ M.T / WHITE
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def from_lab(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    xyz = np.where(f ** 3 > 0.008856, f ** 3, (f - 16 / 116) / 7.787) * WHITE
    c = xyz @ np.linalg.inv(M).T
    c = np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
    return np.clip(np.round(c * 255), 0, 255).astype(np.uint8)


def white_rgb(path, size=704):
    im = Image.open(path)
    if im.mode == 'RGBA':
        bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3]); im = bg
    return im.convert('RGB').resize((size, size), Image.LANCZOS)


def sharp(im):
    g = np.asarray(im.convert('L'), dtype=np.float64)
    return float((g[:-2, 1:-1] + g[2:, 1:-1] + g[1:-1, :-2] + g[1:-1, 2:] - 4 * g[1:-1, 1:-1]).var())


def dilate(mask, r):
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dy * dy + dx * dx <= r * r: out |= np.roll(np.roll(mask, dy, 0), dx, 1)
    return out


def match(art, kf):
    target = sharp(art)
    best = min((abs(sharp(kf.filter(ImageFilter.GaussianBlur(r)) if r else kf) - target), r) for r in [k / 20 for k in range(61)])[1]  # PIL은 numpy 실수를 반경으로 못 받는다
    out = kf.filter(ImageFilter.GaussianBlur(best)) if best else kf
    a, o = np.asarray(art), np.asarray(out)
    ea, eo = EYE(a), EYE(o)
    shift_de = None
    if ea.sum() > 20 and eo.sum() > 20:
        la, lo = to_lab(a), to_lab(o)
        shift = la[ea].mean(0) - lo[eo].mean(0)
        soft = np.asarray(Image.fromarray((dilate(eo, 3) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float64)[..., None] / 255
        new = from_lab(lo + shift * soft)
        keep = soft[..., 0] > 0.002
        o = o.copy(); o[keep] = new[keep]
        shift_de = round(float(np.sqrt((shift ** 2).sum())), 1)
    return Image.fromarray(o), best, shift_de


def eye_de(art, im):
    a, b = np.asarray(art), np.asarray(im)
    if EYE(a).sum() <= 20 or EYE(b).sum() <= 20: return None
    return round(float(np.sqrt(((to_lab(a)[EYE(a)].mean(0) - to_lab(b)[EYE(b)].mean(0)) ** 2).sum())), 1)


def main():
    if len(sys.argv) < 4: print(__doc__); return 2
    art = white_rgb(sys.argv[1]); out_dir = sys.argv[2]; os.makedirs(out_dir, exist_ok=True)
    s0 = sharp(art)
    for p in sys.argv[3:]:
        kf = white_rgb(p)
        res, r, sh = match(art, kf)
        res.save(os.path.join(out_dir, os.path.basename(p)))
        print(f'{os.path.basename(p)}: 흐림 반경 {r:.2f} · 선명도 배율 {sharp(kf) / s0:.2f} → {sharp(res) / s0:.2f} · '
              f'눈 빛 ΔE {eye_de(art, kf)} → {eye_de(art, res)} (옮긴 양 {sh})', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())

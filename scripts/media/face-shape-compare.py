"""같은 사람 얼굴이 장마다 길어지거나 넓어졌는지 숫자로 잰다(2026-10-13 팀장 지시: «A 얼굴이 장마다 비정상적으로 길어진다 — 장별 얼굴
세로/가로 비를 표로»).

방법: 기준 장의 얼굴(타원 안 — 눈썹~턱, 양 볼)을 다른 장의 같은 얼굴에 «아핀 변환»으로 맞춘다(밝기를 평균·표준편차로 맞춘 뒤
정규화 상관이 가장 높은 변환). 그 변환이 기준 얼굴의 세로축(눈 가운데 → 입)을 몇 배, 가로축(왼눈 → 오른눈)을 몇 배로 늘였는지 보고
«세로/가로 비 = 세로 배율 ÷ 가로 배율»을 낸다. 1.00이면 기준과 같은 비율, 1.05면 기준보다 5% 길쭉하다.
점을 손으로 찍는 것보다 덜 흔들린다(점 하나 2화소 차이가 60화소 얼굴에서는 3%다).

사용: python scripts/media/face-shape-compare.py <기준.png> <기준 점> <장.png> <대략 점> [<장.png> <대략 점> ...]
      점 = «왼눈x,왼눈y,오른눈x,오른눈y,입x,입y»(대략 점은 출발값 — 몇 화소 틀려도 된다)
출력: 장마다 세로 배율·가로 배율·세로/가로 비·회전·맞춤 상관, 그리고 기준 점을 그 장으로 옮긴 «맞춘 점»(얼굴 옮겨 붙이기에 쓴다)
종료: 0 · 2 입력 오류
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.optimize import minimize


def pts(s):
    v = [float(x) for x in s.split(',')]
    if len(v) != 6: raise SystemExit('점은 6개 숫자')
    return np.array(v).reshape(3, 2)


def gray(p):
    return ndi.gaussian_filter(np.asarray(Image.open(p).convert('L')).astype(np.float32), 0.8)


def main(argv):
    if len(argv) < 4 or len(argv) % 2: print(__doc__); return 2
    ref_p, ref_s = argv[0], pts(argv[1])
    R = gray(ref_p)
    eyes = (ref_s[0] + ref_s[1]) / 2
    ux = (ref_s[1] - ref_s[0]); ed = np.linalg.norm(ux); ux /= ed                  # 가로축(눈 → 눈)
    uy = ref_s[2] - eyes; em = np.linalg.norm(uy); uy /= em                        # 세로축(눈 가운데 → 입)
    c = eyes + uy * em * 0.45
    # 기준 얼굴 표본점: 가로 반지름 = 눈 사이 × 0.95, 세로 = 눈썹(눈 위 0.45 em) ~ 턱(입 아래 0.75 em)
    a, b = np.meshgrid(np.linspace(-1, 1, 61), np.linspace(-1, 1, 61))
    keep = a ** 2 + b ** 2 <= 1
    a, b = a[keep], b[keep]
    off = (b + 1) / 2 * (1.0 + 0.45 + 0.75) * em - 0.45 * em                      # 눈 가운데 기준 세로 위치
    P = eyes[None] + a[:, None] * ux[None] * ed * 0.95 + off[:, None] * uy[None]
    rv = ndi.map_coordinates(R, [P[:, 1], P[:, 0]], order=1)
    rv = (rv - rv.mean()) / (rv.std() + 1e-6)
    print(f'기준 {ref_p}: 눈 사이 {ed:.1f} · 눈 가운데→입 {em:.1f} · 표본 {len(rv)}점')
    print('| 장 | 세로 배율 | 가로 배율 | 세로/가로 비(기준 1.00) | 회전 | 맞춤 상관 | 맞춘 점 |')
    print('|---|---|---|---|---|---|---|')
    for k in range(2, len(argv), 2):
        T = gray(argv[k]); guess = pts(argv[k + 1])
        g_eyes = (guess[0] + guess[1]) / 2
        # 매개변수: 이동(dx,dy) · 회전 · 가로 배율 · 세로 배율 · 기울임 — 기준 얼굴 축 좌표계에서
        s0 = np.linalg.norm(guess[1] - guess[0]) / ed
        ang0 = np.arctan2(*(guess[1] - guess[0])[::-1]) - np.arctan2(ux[1], ux[0])

        def warp(q):
            dx, dy, th, lsx, lsy, sh = q
            Rm = np.array([[np.cos(th), -np.sin(th)], [np.sin(th), np.cos(th)]])
            B = np.stack([ux, uy], 1)                                              # 축 → 화소
            M = Rm @ B @ np.array([[np.exp(lsx), sh], [0, np.exp(lsy)]]) @ np.linalg.inv(B)
            return (P - eyes) @ M.T + g_eyes + [dx, dy], M

        def cost(q):
            Q, _ = warp(q)
            tv = ndi.map_coordinates(T, [Q[:, 1], Q[:, 0]], order=1, mode='nearest')
            tv = (tv - tv.mean()) / (tv.std() + 1e-6)
            return -float((tv * rv).mean())
        best = None
        for th0 in (ang0 - 0.08, ang0, ang0 + 0.08):
            r = minimize(cost, [0, 0, th0, np.log(s0), np.log(s0), 0], method='Powell',
                         options={'xtol': 1e-3, 'ftol': 1e-5, 'maxiter': 4000})
            if best is None or r.fun < best.fun: best = r
        dx, dy, th, lsx, lsy, sh = best.x
        _, M = warp(best.x)
        sv, sh_ = np.linalg.norm(M @ uy), np.linalg.norm(M @ ux)
        fit = (ref_s - eyes) @ M.T + g_eyes + [dx, dy]
        fit_s = ','.join(f'{v:.1f}' for v in fit.ravel())
        print(f'| {argv[k]} | {sv:.3f} | {sh_:.3f} | **{sv / sh_:.3f}** | {np.degrees(th):.1f}° | {-best.fun:.3f} | {fit_s} |')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

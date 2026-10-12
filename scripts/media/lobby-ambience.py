"""영화관 로비 생활 소리를 직접 합성한다 — 내려받은 효과음 없음(출처: 이 스크립트, 2026-10-13 Bumm님 «영화관 로비에 어울리는 소리», 팀장 전달).

넣는 것(모두 작게 — 찰칵이 가장 또렷해야 한다)
- 로비 웅성거림: 사람 목소리 대역(200~2000Hz)의 잡음을 여러 겹, 음절처럼 느리게 오르내리게 해 «알아듣지 못할 만큼 먼 말소리». 말은 없다.
- 공간음: 아주 낮은 웅웅거림(공조) + 잔향 느낌의 넓은 잡음.
- 매점 소리: 팝콘 튀는 «톡» 소리를 드문드문, 아주 작게.
- 발소리(--steps 초,초,...): 마루 위 구두·운동화 발소리(낮은 «툭» + 짧은 마찰음).
- 옷 스치는 소리(--rustle 시작-끝,...): 데님이 스치는 짧은 잡음.

사용: python scripts/media/lobby-ambience.py <출력.wav> <길이초> [--steps 1.7,2.2,2.7] [--rustle 3.1-3.6,3.9-4.3] [--seed 3]
"""
import sys, wave
import numpy as np
from scipy import signal

SR = 48000


def band(x, lo, hi):
    sos = signal.butter(4, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def low(x, hi):
    return signal.sosfilt(signal.butter(4, hi, btype='low', fs=SR, output='sos'), x)


def main(argv):
    a = list(argv); opt = {'--steps': '', '--rustle': '', '--seed': '3'}
    for k in list(opt):
        if k in a:
            i = a.index(k); opt[k] = a[i + 1]; del a[i:i + 2]
    if len(a) != 2: print(__doc__); return 2
    out, dur = a[0], float(a[1])
    rng = np.random.default_rng(int(opt['--seed']))
    n = int(SR * dur); t = np.arange(n) / SR
    mix = np.zeros(n)
    # 1) 먼 웅성거림: 목소리 대역 잡음 6겹, 각자 3~6Hz 음절 리듬으로 세기가 오르내림
    for _ in range(6):
        v = band(rng.standard_normal(n), 250, 1800)
        rate = rng.uniform(2.5, 5.5); ph = rng.uniform(0, 2 * np.pi)
        env = np.clip(0.55 + 0.45 * np.sin(2 * np.pi * rate * t + ph) + 0.25 * rng.standard_normal(n).cumsum() / np.sqrt(n) * 20, 0, 1.3)
        env = low(env, 8)
        mix += v * env * 0.010
    # 2) 공간음: 낮은 웅웅거림 + 넓은 잡음
    mix += low(rng.standard_normal(n), 140) * 0.012
    mix += band(rng.standard_normal(n), 2000, 7000) * 0.0025
    # 3) 팝콘 «톡»: 드문드문
    for s in rng.uniform(0, dur, int(dur * 2.2)):
        i = int(s * SR); m = int(0.012 * SR)
        if i + m >= n: continue
        click = band(rng.standard_normal(m), 900, 4500) * np.exp(-np.arange(m) / (0.002 * SR))
        mix[i:i + m] += click * rng.uniform(0.010, 0.022)
    # 4) 발소리
    for s in [float(x) for x in opt['--steps'].split(',') if x]:
        i = int(s * SR); m = int(0.16 * SR)
        if i + m >= n: continue
        k = np.arange(m) / SR
        thud = low(rng.standard_normal(m), 260) * np.exp(-k / 0.035) * 0.09
        scuff = band(rng.standard_normal(m), 1500, 6000) * np.exp(-k / 0.018) * 0.025
        mix[i:i + m] += thud + scuff
    # 5) 옷 스치는 소리
    for span in [x for x in opt['--rustle'].split(',') if x]:
        s0, s1 = (float(v) for v in span.split('-'))
        i0, i1 = int(s0 * SR), min(int(s1 * SR), n)
        m = i1 - i0
        if m <= 0: continue
        env = np.sin(np.linspace(0, np.pi, m)) ** 1.5 * (0.6 + 0.4 * np.abs(np.sin(np.linspace(0, 9 * np.pi, m))))
        mix[i0:i1] += band(rng.standard_normal(m), 1200, 8000) * env * 0.03
    mix = np.clip(mix, -1, 1)
    with wave.open(out, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype(np.int16).tobytes())
    print('저장', out, f'{dur}초 · 최대 {np.abs(mix).max():.3f} · 평균 {np.abs(mix).mean():.4f}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))

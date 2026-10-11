"""Seedance로 만든 대기 영상 한 편의 뒤처리(0원) — «영상 만들기 전 확인»에 적어 Bumm님 허락을 받은 순서 그대로(10/10).

1. 크기: 결과(960×960)를 원화와 같은 704×704로 줄인다(LANCZOS).
2. 길이: 24fps로 정확히 192프레임. 첫 프레임은 원화와 같은 장면이라 버리고 2~193번을 쓴다. 모자라면 끝 프레임을 늘린다.
3. 처음·끝: 처음 6프레임은 원화에서, 끝 6프레임은 끝 그림(없으면 원화)으로 겹쳐 넘겨 첫·끝 프레임이 그 그림과 화소까지 같게 한다
   — 앱이 원화 정지 화면에서 영상으로 넘어갈 때 튀지 않게.
4. 무손실 H.264(yuv444p, qp 0 — 다음 단계 투명 처리의 입력이라 화질을 깎지 않는다)로 저장하고, 첫·끝 프레임을 다시 읽어 그림과의 평균 차이를 출력한다.

사용: python scripts/media/post-seedance.py <영상.mp4> <원화.png> <출력.mp4> [--end <끝 그림.png>]
종료코드 0 · 2 대상 없음 · 1 첫·끝이 그림과 다름(평균 차 1.5 초과)
"""
import os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

SIZE, FRAMES, FPS, BLEND = 704, 192, 24, 6


def main():
    args = sys.argv[1:]
    end_p = None
    if '--end' in args:
        i = args.index('--end'); end_p = args[i + 1]; del args[i:i + 2]
    if len(args) != 3: print(__doc__); return 2
    src, start_p, out = args
    if not os.path.exists(src) or not os.path.exists(start_p): print('없는 파일'); return 2
    start = np.asarray(Image.open(start_p).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32)
    end = np.asarray(Image.open(end_p).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32) if end_p else start
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-fps_mode', 'passthrough', os.path.join(tmp, 'f%04d.png')], check=True)
        names = sorted(os.listdir(tmp))
        if len(names) < 2: print('프레임이 없다'); return 2
        frames = names[1:FRAMES + 1]
        frames += [frames[-1]] * (FRAMES - len(frames))
        outdir = os.path.join(tmp, 'out'); os.makedirs(outdir)
        for k, n in enumerate(frames):
            f = np.asarray(Image.open(os.path.join(tmp, n)).convert('RGB').resize((SIZE, SIZE), Image.LANCZOS), dtype=np.float32)
            if k < BLEND:
                w = k / BLEND; f = (1 - w) * start + w * f
            elif k >= FRAMES - BLEND:
                w = (FRAMES - 1 - k) / BLEND; f = (1 - w) * end + w * f
            Image.fromarray(np.clip(f.round(), 0, 255).astype(np.uint8)).save(os.path.join(outdir, f'o{k:04d}.png'))
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(outdir, 'o%04d.png'),
                        '-c:v', 'libx264', '-pix_fmt', 'yuv444p', '-qp', '0', '-movflags', '+faststart', out], check=True)
        chk = os.path.join(tmp, 'chk'); os.makedirs(chk)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', out, '-fps_mode', 'passthrough', os.path.join(chk, 'c%04d.png')], check=True)
        got = sorted(os.listdir(chk))
        first = np.asarray(Image.open(os.path.join(chk, got[0])).convert('RGB'), dtype=np.float32)
        last = np.asarray(Image.open(os.path.join(chk, got[-1])).convert('RGB'), dtype=np.float32)
        d0, d1 = float(np.abs(first - start).mean()), float(np.abs(last - end).mean())
    print(f'{out}: {len(got)}프레임 · {SIZE}×{SIZE} · {FPS}fps · 첫 프레임 대 원화 평균차 {d0:.2f} · 끝 프레임 대 {"끝 그림" if end_p else "원화"} {d1:.2f}')
    if len(got) != FRAMES: print('프레임 수가 192가 아니다'); return 1
    return 1 if max(d0, d1) > 1.5 else 0


if __name__ == '__main__':
    sys.exit(main())

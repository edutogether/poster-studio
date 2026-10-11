"""만든 영상의 얼굴을 3프레임마다 한 장에 늘어놓는다 — 사람이 눈으로 입·눈썹을 훑기 위한 시트(2026-10-11).

왜: 04에서 얼굴 검사 도구(check-face-elements.py)가 3.0~4.75초에 생긴 입을 1프레임만 잡았다. 도구가 놓치는 구간이
있으므로 매 편 사람이 3프레임마다 얼굴을 본다(팀장 지시). 얼굴 자리는 로봇이 움직이므로 고정 상자가 아니라
그 편 원화의 머리 둘레보다 넉넉한 상자를 준다.

사용: python scripts/media/face-scan-sheet.py <영상> <x,y,w,h — 원본 영상 화소 기준 얼굴 상자> <출력.png> [--step 3]
종료코드 0 · 2 대상 없음(프레임 0장이면 실패)
"""
import glob, os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont


def main():
    a = sys.argv[1:]
    step = 3
    if '--step' in a:
        i = a.index('--step'); step = int(a[i + 1]); del a[i:i + 2]
    if len(a) != 3: print(__doc__); return 2
    src, box, out = a
    x, y, w, h = (int(v) for v in box.split(','))
    if not os.path.exists(src): print('없는 영상'); return 2
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-vf', f'select=not(mod(n\\,{step})),crop={w}:{h}:{x}:{y},scale=280:-2',
                        '-fps_mode', 'passthrough', os.path.join(tmp, 'm%04d.png')], check=True)
        fs = sorted(glob.glob(os.path.join(tmp, 'm*.png')))
        if not fs: print('프레임 0장'); return 2
        tw, th = Image.open(fs[0]).size
        font = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 16)
        cols = 8
        sheet = Image.new('RGB', (cols * tw, ((len(fs) + cols - 1) // cols) * (th + 20)), 'white')
        for k, f in enumerate(fs):
            px, py = (k % cols) * tw, (k // cols) * (th + 20)
            sheet.paste(Image.open(f).convert('RGB'), (px, py))
            ImageDraw.Draw(sheet).text((px + 4, py + th + 1), f'{k * step}번 {k * step / 24:.2f}s', fill='black', font=font)
        sheet.save(out)
    print(out, len(fs), '장')
    return 0


if __name__ == '__main__':
    sys.exit(main())

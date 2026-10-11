"""고정 카메라 키프레임의 배경을 빈 자리 그림(clean plate) 하나로 맞춘다 — 촬영 화면 «자리 잡는 영상» 시안(2026-10-11).

왜: 키프레임을 «바로 앞 장을 고쳐 다음 장»으로 그리면(팀장 지시, 사람·옷·의자 일관성) ChatGPT가 매번 그림 전체를 다시 그려
배경의 잔무늬가 장마다 조금씩 뭉개진다(단체 G15의 창가 화분이 G0 대비 평균 화소 차 24 — 눈으로도 뭉개짐이 보였다).
카메라가 고정이므로 사람이 없는 곳은 빈 자리 그림과 같아야 맞다.

어떻게: BiRefNet(로컬 모델, cutout_birefnet.py와 같은 격리 폴더)으로 장마다 사람·의자 투명도를 구해 넓힌 뒤(DILATE),
그 밖은 빈 자리 그림, 안은 그 장 그대로 섞는다. 사람 발밑 그림자를 잃지 않도록 바닥선(FLOOR_Y 비율) 아래는 사람 둘레를
더 넓게(SHADOW) 그 장 그대로 둔다. 섞기 전에 그 장의 색조(채널별 평균·표준편차)를 바뀌는 배경 영역 기준으로 빈 자리 그림에
맞춰, 사람 둘레에 색 경계가 생기지 않게 한다. 사람 영역 화소는 색조 맞춤 외에는 바꾸지 않는다.

작고 멀리 있는 사람(문간에 선 사람 등)은 BiRefNet이 놓쳐 빈 자리로 지워질 수 있다(단체 G3~G5의 D가 실제로 사라졌다).
그런 장은 --keep x0,y0,x1,y1(원본 화소, 여러 번 가능)로 그 상자를 그 장 그대로 두게 한다. 결과는 반드시 눈으로 본다.

사용: rembg-venv의 python으로
  python scripts/media/clean-plate-composite.py [--keep x0,y0,x1,y1]... <빈 자리.png> <출력 폴더> <키프레임.png> [...]
  → <출력 폴더>/<같은 이름>.png, <출력 폴더>/<이름>-mask.png(그 장 그대로 둔 영역) + 장마다 배경 차이(전→후)
종료코드 0 · 2 대상 없음
"""
import os, sys
import numpy as np
from PIL import Image, ImageFilter

TOOLS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.cache', 'tools')
os.environ['U2NET_HOME'] = os.path.join(TOOLS, 'rembg-models')
from rembg import new_session, remove  # noqa: E402

DILATE = 25      # 사람 둘레로 그 장을 그대로 두는 폭(화소, 1536 기준)
SHADOW = 70      # 바닥선 아래에서 더 넓게 두는 폭(발밑 그림자)
FLOOR_Y = 0.55   # 바닥이 시작되는 높이(세로 비율)
FEATHER = 6      # 경계를 부드럽게 섞는 흐림 반경


def grow(mask, r):
    return mask.filter(ImageFilter.MaxFilter(2 * (r // 2) + 1)) if r else mask


def main():
    args, boxes = [], []
    it = iter(sys.argv[1:])
    for a in it:
        if a == '--keep': boxes.append(tuple(int(v) for v in next(it).split(',')))
        else: args.append(a)
    if len(args) < 3: print(__doc__); return 2
    plate_p, out, frames = args[0], args[1], args[2:]
    os.makedirs(out, exist_ok=True)
    plate = np.asarray(Image.open(plate_p).convert('RGB'), dtype=np.float32)
    h, w = plate.shape[:2]
    session = new_session('birefnet-general')
    # 빈 자리 그림의 의자 자리도 그 장 그대로 둔다 — 아니면 앉은 사람 다리 사이로 빈 의자 등받이가 비친다(G15 첫 합성에서 실제로 보였다).
    plate_obj = grow(remove(Image.open(plate_p).convert('RGB'), session=session, only_mask=True).convert('L')
                     .point(lambda v: 255 if v > 24 else 0), DILATE)
    for p in frames:
        img = Image.open(p).convert('RGB')
        if img.size != (w, h): raise SystemExit(f'{p}: 크기 {img.size} ≠ 빈 자리 {(w, h)}')
        alpha = remove(img, session=session, only_mask=True).convert('L').point(lambda v: 255 if v > 24 else 0)
        keep = grow(alpha, DILATE)
        low = grow(alpha, SHADOW)
        floor = Image.new('L', (w, h), 0); floor.paste(255, (0, int(h * FLOOR_Y), w, h))
        keep = Image.fromarray(np.maximum.reduce([np.asarray(keep), np.minimum(np.asarray(low), np.asarray(floor)), np.asarray(plate_obj)]))
        for box in boxes: keep.paste(255, box)
        soft = np.asarray(keep.filter(ImageFilter.GaussianBlur(FEATHER)), dtype=np.float32)[..., None] / 255.0
        f = np.asarray(img, dtype=np.float32)
        bg = soft[..., 0] < 0.01
        if bg.sum() < 0.05 * bg.size: raise SystemExit(f'{p}: 바꿀 배경이 5% 미만 — 사람 영역을 잘못 잡았다')
        fm, fs = f[bg].mean(0), f[bg].std(0) + 1e-6
        pm, ps = plate[bg].mean(0), plate[bg].std(0)
        f2 = np.clip((f - fm) / fs * ps + pm, 0, 255)
        res = soft * f2 + (1 - soft) * plate
        name = os.path.basename(p)
        Image.fromarray(res.round().astype(np.uint8)).save(os.path.join(out, name))
        keep.save(os.path.join(out, name.replace('.png', '-mask.png')))
        before = np.abs(f[bg] - plate[bg]).mean(); after = np.abs(res[bg] - plate[bg]).mean()
        print(f'{name}: 그대로 둔 영역 {100 * (1 - bg.mean()):.1f}% · 배경 차이 {before:.1f} → {after:.1f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

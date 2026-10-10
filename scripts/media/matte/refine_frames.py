# 영상 프레임 전체에 refine_matte를 돌린다. 이미 만든 프레임은 건너뛴다(중간에 멈춰도 이어서 돈다).
# 사용: python refine_frames.py <프레임 RGB 폴더> <AI 마스크 폴더> <출력 폴더> [그림자 진하기 배율]
import glob, os, sys, time
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refine_matte import refine

SRC, MATTE, OUT = sys.argv[1:4]; GAIN = float(sys.argv[4]) if len(sys.argv) > 4 else 1.0
os.makedirs(OUT, exist_ok=True)
t0 = time.time(); done = 0
for f in sorted(glob.glob(os.path.join(SRC, '*.png'))):
    out = os.path.join(OUT, os.path.basename(f))
    if os.path.exists(out): continue
    rgb = np.asarray(Image.open(f).convert('RGB'))
    ai_a = np.asarray(Image.open(os.path.join(MATTE, os.path.basename(f))).convert('RGBA'))[..., 3]
    o_rgb, o_a, _, _ = refine(rgb, ai_a, GAIN)
    Image.fromarray(np.dstack([o_rgb, o_a]), 'RGBA').save(out)
    done += 1
print(f'{done}장 처리 · {time.time() - t0:.0f}초')

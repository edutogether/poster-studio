# 영상 프레임마다 BiRefNet 투명도를 계산한다(색은 그대로, 투명도만). 원화 때와 같은 투명도 조정(8~224).
# 모델은 저장소 밖 격리 폴더(.cache/tools/rembg-models, 환경변수 U2NET_HOME으로 바꿀 수 있다)에 둔다 — 설치는 README.md.
# 사용: python matte_frames.py <프레임 RGB 폴더> <출력 폴더> [처리할 장 수(0=전부)]
import glob, os, sys, time
import numpy as np
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
os.environ.setdefault('U2NET_HOME', os.path.join(ROOT, '.cache', 'tools', 'rembg-models'))
from rembg import new_session, remove
SRC, OUT, LIMIT = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 0
os.makedirs(OUT, exist_ok=True)
s = new_session('birefnet-general')
files = [f for f in sorted(glob.glob(f'{SRC}/*.png')) if not os.path.exists(os.path.join(OUT, os.path.basename(f)))][: LIMIT or None]  # 이미 만든 장면은 건너뛴다
t0 = time.time()
for f in files:
    im = Image.open(f).convert('RGB').resize((704, 704), Image.LANCZOS)
    a = np.asarray(remove(im, session=s, only_mask=True).convert('L')).astype(np.float32)
    a = (np.clip((a - 8) / (224 - 8), 0, 1) * 255).round().astype(np.uint8)
    Image.fromarray(np.dstack([np.asarray(im), a]), 'RGBA').save(os.path.join(OUT, os.path.basename(f)))
print(f'{len(files)}장 · 장당 {(time.time()-t0)/max(1,len(files)):.2f}초')

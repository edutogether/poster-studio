# AI 품질 A/B — 손질 칸 대표 비교 시트(PNG). 칸(장르 × 혼자/단체)마다 한 줄: 난이도 3장 각각 «현재 최고 후보 | 손질».
#   python -I fix-sheet.py <poster-ai-test-results.json> <그림 폴더[;폴더]> <best.json> <출력.png> [손질 갈래 G]
# best.json = { '장르/혼자|단체': 갈래 } — 그 칸에서 지금 가장 좋은 후보(추천표)의 갈래.
import json, os, sys
from datetime import datetime, timedelta
from PIL import Image, ImageDraw, ImageFont

results_path, dirs, best_path, out = sys.argv[1:5]
FIX = sys.argv[5] if len(sys.argv) > 5 else 'G'
dirs = [d for d in dirs.split(';') if d]
R = json.load(open(results_path, encoding='utf8'))
best = json.load(open(best_path, encoding='utf8'))
GNAME = {'sf': 'SF', 'fantasy': '판타지', 'animation': '애니메이션', 'hero': '히어로', 'mystery': '스릴러', 'director': '드라마', 'sports': '스포츠', 'music': '뮤지컬'}
ARMNAME = {'A': '기존', 'B': '새것', 'E': '기존+', 'F': '기존+2', 'G': '손질'}
LEVELS = [('easy', '쉬움'), ('medium', '보통'), ('hard', '어려움')]
F = lambda s, b=False: ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf' if b else 'C:/Windows/Fonts/malgun.ttf', s)
PW, PH, G, M = 300, 450, 10, 20


def path_of(name):
    for d in dirs:
        if os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return None


calls = {(c['caseId'], c['arm']): c for c in R['calls']}
cells = [k for k in best]
W = M * 2 + 3 * (PW * 2 + G) + 2 * 30
ROW = 40 + PH + 60
im = Image.new('RGB', (W, 110 + ROW * len(cells)), (247, 247, 251))
d = ImageDraw.Draw(im)
d.text((M, 18), '손질 7칸 대표 비교 — 칸마다 사진 3장 · «현재 최고 후보 | 손질»', fill=(31, 35, 51), font=F(34, True))
d.text((M, 66), f"{R['kind']} · {(datetime.fromisoformat(R['generatedAt'].replace('Z', '+00:00')) + timedelta(hours=9)):%Y-%m-%d %H:%M} KST", fill=(4, 120, 87), font=F(20))
for i, cell in enumerate(cells):
    genre, mode = cell.split('/')
    y = 110 + ROW * i
    d.text((M, y + 4), f"{GNAME[genre]} · {'혼자' if mode == 'solo' else '단체'} — 현재 최고 {ARMNAME[best[cell]]}({best[cell]}) vs 손질({FIX})", fill=(79, 70, 229), font=F(24, True))
    x = M
    for lv, lname in LEVELS:
        case = f'{genre}-{mode}-{lv}'
        for arm in (best[cell], FIX):
            c = calls.get((case, arm))
            p = path_of(c['file']) if c and c.get('file') else None
            if p:
                im.paste(Image.open(p).convert('RGB').resize((PW, PH)), (x, y + 40))
            else:
                d.rectangle([x, y + 40, x + PW - 1, y + 40 + PH - 1], outline=(190, 194, 210), width=3)
            d.text((x, y + 44 + PH), f"{lname} {c['photoId'] if c else ''} · {ARMNAME[arm]}", fill=(31, 35, 51), font=F(17, True))
            x += PW + G
        x += 30 - G
im.save(out, optimize=True)
print(out, im.size)

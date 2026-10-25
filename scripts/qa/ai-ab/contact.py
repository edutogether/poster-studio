# AI 품질 A/B — 대표 비교 시트(PNG). 8개 장르마다 한 줄: 원본(입력) / Before(A 기존) / After(B 개선), 조건 · 판 · 시간 · 비용 · 검사를 적는다.
#   python -I scripts/qa/ai-ab/contact.py <poster-ai-test-results.json> <그림 폴더> <입력 폴더> <혼자 시트.png> <단체 시트.png>
# 장르 i의 대표 = 촬영 난이도 [쉬움, 보통, 어려움][i % 3] — 8줄 안에 세 난이도가 고루 들어간다. 한 장에 너무 줄이지 않게 혼자 · 단체를 나눠 두 장으로 낸다.
import json, os, sys
from datetime import datetime, timedelta
from PIL import Image, ImageDraw, ImageFont

results_path, results_dir, inputs_dir, out_solo, out_group = sys.argv[1:6]
R = json.load(open(results_path, encoding='utf8'))
GENRES = ['sf', 'fantasy', 'animation', 'hero', 'mystery', 'director', 'sports', 'music']
GNAME = {'sf': 'SF', 'fantasy': '판타지', 'animation': '애니메이션', 'hero': '히어로', 'mystery': '스릴러', 'director': '드라마', 'sports': '스포츠', 'music': '뮤지컬'}
LEVELS = ['easy', 'medium', 'hard']
LNAME = {'easy': '쉬움', 'medium': '보통', 'hard': '어려움'}
ARMNAME = {'A': 'Before — A 기존(운영 지시문 v1)', 'B': 'After — B 개선(지시문 v2)'}
F = lambda s, b=False: ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf' if b else 'C:/Windows/Fonts/malgun.ttf', s)
fT, fH, fS = F(40, True), F(26, True), F(20)

PH = 600                      # 포스터 높이(2:3 → 400×600), 입력은 4:3 → 800×600
M, G = 24, 16
W = M + 800 + G + 400 + G + 400 + M
ROW = 44 + PH + 64


def fit(path, w, h):
    im = Image.open(path).convert('RGB')
    return im.resize((w, h), Image.LANCZOS)


def miss(d, x, y, w, h, text):
    d.rectangle([x, y, x + w - 1, y + h - 1], outline=(190, 194, 210), width=3)
    d.text((x + 16, y + h // 2 - 14), text, fill=(150, 154, 170), font=fS)


def sheet(mode, out):
    calls = [c for c in R['calls'] if c['mode'] == mode]
    H = 120 + ROW * len(GENRES) + M
    im = Image.new('RGB', (W, H), (247, 247, 251))
    d = ImageDraw.Draw(im)
    d.text((M, 22), f"Poster Studio AI A/B 대표 비교 — {'혼자' if mode == 'solo' else '단체'} · 8개 장르", fill=(31, 35, 51), font=fT)
    kind = R['kind']
    d.text((M, 76), f"{kind} · 만든 시각 {(datetime.fromisoformat(R['generatedAt'].replace('Z', '+00:00')) + timedelta(hours=9)):%Y-%m-%d %H:%M} KST · 원본(웹캠 재현 입력) / Before / After", fill=(190, 18, 60) if 'DRY' in kind else (4, 120, 87), font=fS)
    for i, g in enumerate(GENRES):
        lv = LEVELS[i % 3]
        y = 120 + ROW * i
        a = next((c for c in calls if c['genre'] == g and c['difficulty'] == lv and c['arm'] == 'A'), None)
        b = next((c for c in calls if c['genre'] == g and c['difficulty'] == lv and c['arm'] == 'B'), None)
        base = a or b
        d.text((M, y + 6), f"{GNAME[g]} · {LNAME[lv]} · 사진 {base['photoId']} · «{base['title']}» — {base['caseId']}", fill=(79, 70, 229), font=fH)
        yy = y + 44
        x = M
        im.paste(fit(os.path.join(inputs_dir, f"{base['photoId']}.jpg"), 800, 600), (x, yy))
        d.text((x, yy + PH + 6), '원본 — 웹캠 재현 입력 1024×768(거울 · JPEG 0.85)', fill=(91, 97, 120), font=fS)
        x += 800 + G
        for arm, c in (('A', a), ('B', b)):
            if c and c['status'] == 'ok':
                im.paste(fit(os.path.join(results_dir, c['file']), 400, PH), (x, yy))
                cap1 = ARMNAME[arm] + (' · DRY 가짜' if c['dry'] else '')
                cap2 = f"{c['model']} {c['quality'] or ''} · {c['ms'] / 1000:.1f}초 · ${c['cost']:.3f} · 검사 {c['checks']['overall'] if c['checks'] else '—'}"
            else:
                miss(d, x, yy, 400, PH, '생성 없음(' + (c['status'] if c else '계획 없음') + ')')
                cap1, cap2 = ARMNAME[arm], ''
            d.text((x, yy + PH + 6), cap1, fill=(31, 35, 51), font=F(18, True))
            d.text((x, yy + PH + 32), cap2, fill=(91, 97, 120), font=F(17))
            x += 400 + G
    im.save(out, optimize=True)
    print(out, im.size)


sheet('solo', out_solo)
sheet('group', out_group)

#!/usr/bin/env python3
"""포스터(캔버스)용 PretendardFull을 «핵심 한 조각 + 나머지 연속 구간 조각»으로 자른다(2026-10-24).

왜: 포스터를 만들 때마다 전체 Pretendard를 굵기당 약 780KB × 6굵기 = 4.6MB 받았다. 느린 와이파이에서
샘플 흐름이 40초가 아니라 80초 걸린 가장 큰 원인이었다(scripts/verify/net-perf.mjs로 잼).
아이 이름·제목·문구는 거의 다 KS X 1001 상용 한글 2350자 안에 있으므로, 그 음절과 src/fullFontCore.json의 범위
(영문·문장부호·한글 자모·자주 쓰는 기호)를 '핵심'(굵기당 약 200KB, 패밀리 PretendardFull)에 담고, 나머지
(드문 음절 8822자 + 드문 기호)는 코드 순서로 연속 구간 SLICES개로 잘라 패밀리 PretendardFullRare로 둔다.
브라우저는 핵심에 없는 글자를 그릴 때만 그 글자가 든 구간 조각을 받는다(layout.ts의 ensureGlyphs가 미리 받는다).

글자 모양은 원본 그대로다 — 쪼개기만 한다. 한글 음절이 끼는 커닝·치환이 원본에 없음을 확인했으므로(2026-10-24,
GPOS 쌍 조정·GSUB 0건) 조각 경계를 넘는 조정이 사라지는 일도 없다. 포스터 40지문이 그대로인지
scripts/verify/release-baseline.mjs로 대조한다.

    python scripts/fonts/slice-full.py
      → public/fonts/full/Pretendard-{굵기}-core.woff2 · -r01…woff2 를 새로 쓰고
        public/fonts/pretendard.css 의 ▼▼ … ▲▲ 구역(@font-face)을 다시 쓴다(주소에 내용 판 ?v=).
"""
import hashlib, io, json, os, re, sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONTS = os.path.join(ROOT, 'public', 'fonts')
OUT = os.path.join(FONTS, 'full')
CSS = os.path.join(FONTS, 'pretendard.css')
CORE_JSON = os.path.join(ROOT, 'src', 'fullFontCore.json')
WEIGHTS = [('Regular', 400), ('Medium', 500), ('SemiBold', 600), ('Bold', 700), ('ExtraBold', 800), ('Black', 900)]
SLICES = 16
START = '/* ▼▼ scripts/fonts/slice-full.py'
END = '/* ▲▲ */'


def common_syllables():
    """KS X 1001 상용 한글 2350자 — 0xB0~0xC8행 × 0xA1~0xFE열. layout.ts는 같은 표를 TextDecoder('euc-kr')로 만든다."""
    out = set()
    for lead in range(0xB0, 0xC9):
        for trail in range(0xA1, 0xFF):
            out.add(ord(bytes([lead, trail]).decode('euc-kr')))
    if len(out) != 2350 or not all(0xAC00 <= c <= 0xD7A3 for c in out):
        sys.exit('상용 음절 표가 2350자가 아니다 — 파이썬 euc-kr 코덱을 확인하세요.')
    return out


def core_ranges():
    with io.open(CORE_JSON, encoding='utf-8') as f:
        return [tuple(int(x, 16) for x in r.split('-')) for r in json.load(f)['ranges']]


def save(src, cps, dst):
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']   # subset.py와 같다 — 글자 모양·배치에 쓰이는 기능을 하나도 버리지 않는다
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    font = TTFont(src)
    s = subset.Subsetter(opts)
    s.populate(unicodes=cps)
    s.subset(font)
    font.flavor = 'woff2'
    font.save(dst)
    with open(dst, 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()[:10], os.path.getsize(dst)


def face(family, weight, file, ver, rng=None):
    ur = ';unicode-range:U+%X-%X' % rng if rng else ''
    return ("@font-face{font-family:'%s';font-weight:%d;font-style:normal;font-display:block;"
            "src:url('full/%s?v=%s') format('woff2')%s}" % (family, weight, file, ver, ur))


def main():
    common = common_syllables()
    ranges = core_ranges()
    os.makedirs(OUT, exist_ok=True)
    for name in os.listdir(OUT):
        if re.fullmatch(r'Pretendard-[A-Za-z]+-(core|r\d\d)\.woff2', name):
            os.remove(os.path.join(OUT, name))
    core_rules, rare_rules = [], []
    groups = None
    total = 0
    for wname, weight in WEIGHTS:
        src = os.path.join(FONTS, f'Pretendard-{wname}.woff2')
        cmap = set(TTFont(src).getBestCmap())
        core = {c for c in cmap if c in common or any(a <= c <= b for a, b in ranges)}
        rest = sorted(cmap - core)
        per = -(-len(rest) // SLICES)
        g = [rest[i * per:(i + 1) * per] for i in range(SLICES)]
        if groups is None:
            groups = g
        elif [(x[0], x[-1]) for x in g] != [(x[0], x[-1]) for x in groups]:
            sys.exit(f'{wname}의 글자 목록이 다른 굵기와 달라 구간이 어긋난다 — 원본 글꼴을 확인하세요.')
        ver, size = save(src, sorted(core), os.path.join(OUT, f'Pretendard-{wname}-core.woff2'))
        core_rules.append(face('PretendardFull', weight, f'Pretendard-{wname}-core.woff2', ver))
        sizes = []
        for i, part in enumerate(g, 1):
            file = f'Pretendard-{wname}-r{i:02d}.woff2'
            v, sz = save(src, part, os.path.join(OUT, file))
            rare_rules.append(face('PretendardFullRare', weight, file, v, (part[0], part[-1])))
            sizes.append(sz)
        total += size + sum(sizes)
        print('%-10s 핵심 %5.0fKB(%d자) · 나머지 %d조각 %d~%dKB(%d자)'
              % (wname, size / 1024, len(core), SLICES, min(sizes) // 1024, max(sizes) // 1024, len(rest)))
    finger = hashlib.sha256(''.join(chr(c) for c in sorted(common)).encode('utf-8')).hexdigest()[:12]
    block = '\n'.join([
        f'{START}가 쓴다 — 손으로 고치지 않는다(다시 만들려면 그 도구를 돌린다).',
        f'   핵심 PretendardFull: KS X 1001 상용 음절 2350자(지문 {finger}) + src/fullFontCore.json의 범위',
        f'   나머지 PretendardFullRare: 코드 순서 연속 구간 {SLICES}개 */',
        *core_rules, *rare_rules, END])
    css = io.open(CSS, encoding='utf-8').read()
    a, b = css.find(START), css.find(END)
    if a < 0 or b < a:
        sys.exit(f'{CSS}에서 생성 구역(▼▼ … ▲▲)을 못 찾았다.')
    io.open(CSS, 'w', encoding='utf-8', newline='\n').write(css[:a] + block + css[b + len(END):])
    print('합계 %.0fKB · @font-face %d개 → %s' % (total / 1024, len(core_rules) + len(rare_rules), os.path.relpath(CSS, ROOT)))


if __name__ == '__main__':
    main()

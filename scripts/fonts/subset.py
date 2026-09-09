#!/usr/bin/env python3
"""UI용 Pretendard 서브셋을 만든다(2026-09-09).

왜: 이 앱의 Pretendard는 서브셋 없이 굵기당 약 750KB이고 UI가 5굵기를 쓴다 —
첫 로드에 약 3.8MB다. 행사장은 하루 대여 와이파이에 노트북 3대라 그만큼이
그대로 대기 시간이 된다. UI에 나오는 글자는 고정된 소수라 잘라내면 4.5%로 줄어든다.

캔버스(인쇄되는 포스터)는 아이가 입력하는 임의의 한글을 그리므로 전체 커버리지가
계속 필요하다 — 그쪽은 PretendardFull 이라는 별도 패밀리로 **생성 버튼을 누른 뒤**
받는다. 어차피 AI를 10~25초 기다리는 구간이라 체감 지연이 없다.

    node scripts/fonts/charset.mjs      # 글자 집합을 먼저 뽑고
    python scripts/fonts/subset.py      # 그걸로 자른다
"""
import io, os, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
FONTS = os.path.join(ROOT, 'public', 'fonts')
OUT = os.path.join(FONTS, 'subset')
CHARSET = os.path.join(ROOT, 'scripts', 'fonts', 'subset-charset.txt')

# UI가 쓰는 굵기만. 900(Black)은 캔버스 전용이라 서브셋에 넣지 않는다
# (style.css의 font-weight를 전수 확인함: 500/600/700/800 + 기본 400).
WEIGHTS = ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold']


def main():
    if not os.path.exists(CHARSET):
        sys.exit('먼저 `node scripts/fonts/charset.mjs`로 글자 집합을 뽑으세요.')
    os.makedirs(OUT, exist_ok=True)
    chars = io.open(CHARSET, encoding='utf-8').read()
    total_before = total_after = 0
    for w in WEIGHTS:
        src = os.path.join(FONTS, f'Pretendard-{w}.woff2')
        dst = os.path.join(OUT, f'Pretendard-{w}.woff2')
        r = subprocess.run(
            [sys.executable, '-m', 'fontTools.subset', src,
             f'--text-file={CHARSET}', '--flavor=woff2',
             '--layout-features=*', f'--output-file={dst}'],
            capture_output=True, text=True)
        if r.returncode != 0:
            sys.exit(f'{w} 서브셋 실패: {(r.stderr or r.stdout).strip()[-300:]}')
        b, a = os.path.getsize(src), os.path.getsize(dst)
        total_before += b
        total_after += a
        print('%-10s %7.0f KB -> %6.1f KB  (%.1f%%)' % (w, b / 1024, a / 1024, 100 * a / b))
    print('%-10s %7.0f KB -> %6.1f KB  (%.1f%%)  글자 %d자'
          % ('합계', total_before / 1024, total_after / 1024,
             100 * total_after / total_before, len(chars)))


if __name__ == '__main__':
    main()

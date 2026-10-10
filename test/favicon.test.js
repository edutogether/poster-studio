/* ────────────────────────────────────────────────────────────────────
   파비콘은 InKY 노란 카메라(필름 포함 전체 로고) 하나로 고정한다
   (Bumm님 결정 2026-10-07, COMMON_STANDARDS §33).

   예전에는 src/favicon.ts가 📷 이모지를 캔버스에 그려 꽂고, 탭이 비활성이면
   흑백으로 바꿔치기했다. §33이 그 회색 전환을 폐기했으므로 이 검사가 두 가지를
   못 박는다:
   1. 각 HTML 페이지에 아이콘 링크가 정확히 하나, `/favicon-inky.png?v=날짜`를 가리킨다.
   2. 어떤 소스도 실행 중에 아이콘 링크를 건드리지 않는다(탭 상태에 따른 교체 금지).
   ──────────────────────────────────────────────────────────────────── */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
/* ?v=날짜: 주소가 그대로면 브라우저가 최대 1시간 예전 아이콘을 쓴다(Hosting max-age=3600) — 그림을 바꿀 때마다 날짜를 올린다 */
const ICON_HREF = '/favicon-inky.png?v=20261008';
/* _shared/favicons/inky-camera-64.png 원본 그대로. 다시 자르거나 인코딩하면 값이 바뀐다. */
const ICON_SHA256 = 'f74e7e0a1dc21be7f003d691ae308396ccdee10d2a681af85c7cff5cad6558d5';

function iconLinks(html) {
  return (html.match(/<link\b[^>]*>/gi) ?? []).filter((tag) => {
    const rel = tag.match(/\brel\s*=\s*["']([^"']*)["']/i);
    return rel && rel[1].toLowerCase().split(/\s+/).includes('icon');
  });
}

for (const page of ['index.html', 'privacy.html']) {
  test(`${page}: 아이콘 링크가 정확히 하나이고 ${ICON_HREF}를 가리킨다`, () => {
    const links = iconLinks(fs.readFileSync(path.join(ROOT, page), 'utf8'));
    expect(links, `${page}의 rel=icon 링크`).toHaveLength(1);
    expect(links[0].match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1]).toBe(ICON_HREF);
  });
}

test('public/favicon-inky.png가 공용 원본과 바이트 단위로 같다', () => {
  const file = path.join(ROOT, 'public', 'favicon-inky.png');
  expect(fs.existsSync(file), 'public/favicon-inky.png가 있어야 dist/로 복사돼 배포된다').toBe(true);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  expect(sha).toBe(ICON_SHA256);
});

function sourceFiles(dir, exts) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full, exts);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

test('어떤 소스도 실행 중에 파비콘을 바꾸지 않는다', () => {
  const files = [
    ...sourceFiles(path.join(ROOT, 'src'), ['.ts', '.tsx', '.js']),
    ...sourceFiles(path.join(ROOT, 'public'), ['.js'])
  ];
  // 🔴 대상이 0건이면 통과하지 않는다 — 경로가 바뀌어 아무것도 안 읽어도 초록불이 켜지면 안 된다.
  expect(files.length).toBeGreaterThan(0);
  const forbidden = [
    /favicon/i,
    /rel\s*~?=\s*\\?["']?\s*(?:shortcut\s+)?icon/i,
    /\.rel\s*=\s*["'](?:shortcut\s+)?icon/i
  ];
  const offenders = files.filter((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return forbidden.some((re) => re.test(text));
  });
  expect(offenders.map((f) => path.relative(ROOT, f).split(path.sep).join('/'))).toEqual([]);
});

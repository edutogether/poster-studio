/* 포스터 글꼴 자체 호스팅(2026-10-07, scripts/fonts/fetch-poster-fonts.mjs).
   화면·포스터가 외부 글꼴 서비스를 부르지 않고, 규칙이 가리키는 파일이 전부 실제로 있어야 한다.
   하나라도 빠지면 그 조각의 글자가 대체 글꼴로 그려져 인쇄 포스터가 바뀐다. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const FONTS = path.join(ROOT, 'public', 'fonts');
const css = fs.readFileSync(path.join(FONTS, 'poster.css'), 'utf8');
const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]);

test('화면 진입 HTML은 외부 글꼴 서비스를 부르지 않고 자체 글꼴 규칙을 읽는다', () => {
  for (const file of ['index.html', 'privacy.html']) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    expect(html, file).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  }
  expect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).toContain('href="fonts/poster.css"');
});

test('포스터 글꼴 규칙의 파일이 전부 있고 woff2이며, 쓰지 않는 파일이 남아 있지 않다', () => {
  // 🔴 대상이 0건이면 통과하지 않는다.
  expect(urls.length, '글꼴 규칙에서 파일 주소를 하나도 못 찾았다').toBeGreaterThan(100);
  for (const family of ['Black Han Sans', 'Noto Serif KR', 'Anton', 'Bebas Neue']) {
    expect(css, family).toContain(`font-family: '${family}'`);
  }
  const referenced = new Set();
  for (const url of urls) {
    expect(url, '외부 주소가 남으면 안 된다').toMatch(/^poster\/[a-z0-9]+\/[A-Za-z0-9_.-]+\.woff2$/);
    const file = path.join(FONTS, url);
    const head = fs.readFileSync(file).subarray(0, 4).toString('latin1');
    expect(head, url).toBe('wOF2');
    referenced.add(path.normalize(file));
  }
  const onDisk = fs
    .readdirSync(path.join(FONTS, 'poster'), { recursive: true })
    .filter((f) => String(f).endsWith('.woff2'))
    .map((f) => path.normalize(path.join(FONTS, 'poster', String(f))));
  expect(onDisk.sort()).toEqual([...referenced].sort());
});

test('글꼴마다 라이선스(OFL)가 같이 있다', () => {
  for (const family of fs.readdirSync(path.join(FONTS, 'poster'))) {
    const text = fs.readFileSync(path.join(FONTS, 'poster', family, 'OFL.txt'), 'utf8');
    expect(text, family).toMatch(/SIL OPEN FONT LICENSE/i);
  }
});

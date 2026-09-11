/* ────────────────────────────────────────────────────────────────────
   배포 헤더(CSP)가 화면 기능을 막지 않는지 고정한다.

   🔴 왜 있는가 (2026-09-11 라이브 확인에서 나온 결함):
   촬영한 사진 미리보기(`#snapshot`)는 `URL.createObjectURL(blob)`이 만든
   **`blob:` URL**을 쓴다. 그런데 라이브 CSP의 `img-src`가 `'self' data:`뿐이라
   **미리보기가 라이브에서 아예 안 떴다** — 아이가 자기 사진을 보고 "다시 찍을까"를
   판단할 수 없는 상태였다. 촬영·생성·인쇄는 정상이라 더 눈에 안 띄었다.

   **9/1 Hosting 이전 이후 계속 그랬을 가능성이 높다.** 못 본 이유가 분명하다 —
   화면 확인을 늘 `localhost`나 `dist/`를 연 정적 서버에서 했는데 **거기엔 이 CSP가
   없다.** 그래서 사람의 눈이 아니라 이 검사로 고정한다.

   `firebase.json`은 JSON이라 주석을 달 수 없다. 그 자리에 못을 박는 것이 이 파일이다.
   ──────────────────────────────────────────────────────────────────── */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const csp = (() => {
  const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
  const hosting = Array.isArray(cfg.hosting) ? cfg.hosting[0] : cfg.hosting;
  const values = (hosting.headers ?? [])
    .flatMap((h) => h.headers ?? [])
    .filter((h) => h.key.toLowerCase() === 'content-security-policy')
    .map((h) => h.value);
  // 🔴 대상이 0건이면 통과하지 않는다 — 헤더가 통째로 사라져도 빨간불이어야 한다.
  expect(values.length, 'firebase.json에 Content-Security-Policy 헤더가 있어야 한다').toBeGreaterThan(0);
  return values[0];
})();

/** `img-src 'self' data: blob:` → ["'self'", 'data:', 'blob:'] */
function directive(name) {
  const found = csp
    .split(';')
    .map((s) => s.trim())
    .find((s) => s === name || s.startsWith(name + ' '));
  expect(found, `CSP에 ${name} 지시자가 있어야 한다`).toBeTruthy();
  return found.slice(name.length).trim().split(/\s+/).filter(Boolean);
}

test('CSP img-src가 blob:을 허용한다 — 촬영 사진 미리보기가 blob: URL이다', () => {
  expect(
    directive('img-src'),
    '이걸 빼면 라이브에서 촬영 미리보기가 깨진 이미지로 나온다(2026-09-11 실제로 그랬다)'
  ).toContain('blob:');
});

test('CSP가 다른 곳까지 느슨해지지 않았다 — blob:은 img-src에만', () => {
  for (const name of ['default-src', 'script-src', 'connect-src']) {
    expect(directive(name), `${name}에는 blob:이 들어가면 안 된다`).not.toContain('blob:');
  }
});

test('CSP의 핵심 지시자가 그대로다 — 예외를 넓히다 이것들이 풀리면 안 된다', () => {
  expect(directive('default-src')).toEqual(["'self'"]);
  expect(directive('script-src')).toEqual(["'self'"]);
  expect(directive('object-src')).toEqual(["'none'"]);
  expect(directive('frame-ancestors')).toEqual(["'none'"]);
});

// 라이브 동작 스위치(2026-10-20 Bumm님 결정 — .env.production에서 src/studioMode.ts로). 행사 날도 «both»(두 단추).
import { expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { LIVE_MODE, STUDIO_MODE } from '../src/studioMode.js';

test('라이브 값은 «both»(두 단추)이고, 시험 · 배포 빌드에서는 그 값을 그대로 쓴다', () => {
  expect(LIVE_MODE).toBe('both');
  expect(STUDIO_MODE).toBe(LIVE_MODE);   // vitest의 모드(test)는 확인용 빌드(check-*)가 아니다
});

test('앱 코드는 VITE_SAMPLE_MODE(예전 .env 스위치)를 더 읽지 않는다 — 스위치는 한 곳뿐', () => {
  const files: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) files.push(p); } };
  walk('src');
  expect(files.length).toBeGreaterThan(10);   // 훑을 파일이 없으면 빈 검사다
  const readers = files.filter((f) => /import\.meta\.env\.VITE_/.test(fs.readFileSync(f, 'utf8')));
  expect(readers).toEqual([]);
});

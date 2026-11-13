/* 폭 경계는 «~1099 / 1100~»다(2026-11-13 해상도 점검 ②④, Bumm님 «고침»).
   예전 «max-width: 1100px» 세 곳이 «min-width: 1100px» 규칙과 정확히 1100에서 겹쳐, 폭 1100(설치판 최소 창)만 2단계 오른쪽 칸이 좁아져
   주 단추가 칸 밖으로 36px 나가고 이름표가 두 줄이 됐다. 실제 화면은 scripts/verify/desktop-real-window.mjs · viewport-survey.mjs가 재고,
   여기서는 겹치는 경계 글이 화면 CSS에 다시 들어오지 않는지만 본다. */
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from 'vitest';

const cssFiles = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return cssFiles(p);
  return e.name.endsWith('.css') ? [p] : [];
});

test('화면 CSS에 «max-width: 1100px» 경계가 없다(1100은 «min-width: 1100px» 쪽)', () => {
  const files = cssFiles('src');
  expect(files.length).toBeGreaterThan(5);   // 훑을 파일이 0개면 검사가 아니다
  const hits = files.flatMap((f) => {
    const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    return /max-width:\s*1100px/.test(text) ? [f] : [];
  });
  expect(hits).toEqual([]);
});

test('1100 쪽 규칙은 남아 있다(경계를 지워서 통과시키지 않았다)', () => {
  const all = cssFiles('src').map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  expect(all).toMatch(/max-width:\s*1099px/);
  expect(all).toMatch(/min-width:\s*1100px/);
});

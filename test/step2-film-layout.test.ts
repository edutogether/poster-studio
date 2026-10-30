/* 2단계 오른쪽 «오늘 촬영할 영화» PC 창 크기 구간 배치(studio.css 끝 — 10/27 설치판에서 만들어 10/31 웹에도, 팀장 전달).
   실제 화면 자리는 scripts/verify/step2-geometry.mjs(헤드리스)가 재고, 여기서는 규칙 글이 갈리지 않는지만 본다. */
import fs from 'node:fs';
import { test, expect } from 'vitest';

// 이 컴퓨터의 체크아웃은 CRLF일 수 있다(core.autocrlf) — 줄 끝을 맞춘 뒤 본다(10/31 웹 가지에서 «\n}\n»을 못 찾아 블록이 파일 끝까지 늘어났다)
const studio = fs.readFileSync('src/studio.css', 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (text: string) => [...text.matchAll(/ {2}(#cameraWorkspace \.camera-ticket[^{]*)\{([^}]*)\}/g)]
  .map(([, selector, body]) => `${selector.trim()} { ${body.replace(/\s+/g, ' ').trim()} }`);
const block = (start: string, end: string) => {
  const from = studio.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  return studio.slice(from, studio.indexOf(end, from));
};

/* 낮은 창 · 아주 높은 창의 세로형 티켓은 태블릿 세로 배치의 승인된 규칙을 그대로 옮긴 것이다(10/27 Bumm님 «패드에 사용했던 세로형 티켓»).
   한쪽만 고쳐 두 티켓 모양이 갈리지 않게, 규칙(선택자 · 선언)이 하나도 빠짐없이 같은지 본다. */
test('세로형 티켓 규칙 = 태블릿 세로 배치의 규칙 그대로', () => {
  const tablet = rules(block('@media (min-width: 761px) and (max-width: 1099px) and (min-height: 960px) and (orientation: portrait)', '#cameraWorkspace .camera-actions {'));
  const band = rules(block('@media (min-width: 1100px) and (min-height: 680px) and (max-height: 869px), (min-width: 1100px) and (min-height: 1760px)', '\n}\n'));
  expect(tablet.length).toBe(16);
  expect(band).toEqual(tablet);
});

// 설치판 전용 범위(body[data-desktop])가 남으면 웹만 옛 배치로 갈린다 — 설치판과 웹이 같은 화면이어야 한다(10/31)
test('창 크기 배치는 설치판 전용 범위 없이 웹과 설치판에 함께 걸린다', () => {
  const from = studio.indexOf('@media (min-width: 1100px) and (min-height: 821px)');
  expect(from).toBeGreaterThan(-1);
  const band = studio.slice(from);
  expect(band).toMatch(/#cameraWorkspace \.camera-film-card/);
  expect(band).not.toMatch(/data-desktop/);
});

// 1536 폭(1920 화면 125%)과 폭 1440에서만 «나답게 …» 제목을 사진 윗선에 맞춘다 — 1366 · 1600 등 다른 크기는 그대로(10/31 Bumm님 확정, 팀장 전달)
test('제목 내림은 1536 폭 · 1440 폭의 높이 780~869 창에만', () => {
  expect(studio).toMatch(/@media \(min-width: 1500px\) and \(max-width: 1599px\) and \(min-height: 780px\) and \(max-height: 869px\), \(min-width: 1440px\) and \(max-width: 1440px\) and \(min-height: 780px\) and \(max-height: 869px\) \{\s*#cameraWorkspace \.page-heading \{ margin-top: 35px; \}\s*\}/);
  expect(studio.match(/margin-top: 35px/g)).toHaveLength(1);
});

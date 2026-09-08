// print.js(PNG 저장/인쇄)는 8차 종합감사(2026-09-30) 시점까지 테스트가 0개였다.
// load-app.js의 fake document.body가 appendChild된 엘리먼트를 기록하도록
// 확장한 덕분에, 실제로 인쇄용 <div id="printArea">가 만들어지고 그 안의
// <img>가 로드된 뒤에야 window.print()가 호출되는 흐름, 그리고 인쇄가 끝난
// 뒤(afterprint) printArea가 정리되는 흐름까지 실제 프로덕션 핸들러로 검증한다.
import { test, expect, vi } from 'vitest';
import { loadApp } from './load-app.js';

function makeFakePoster() {
  return { label: '테스트', canvas: { toDataURL: () => 'data:image/png;base64,FAKE_POSTER' } };
}

test('downloadBtn: 포스터가 없으면 안내만 하고 아무 것도 만들지 않는다', async () => {
  const app = await loadApp();
  app.document.getElementById('downloadBtn').onclick();
  expect(app.document.getElementById('status').textContent).toMatch(/먼저 포스터를 만들어/);
  expect(app.document.body.appended.length).toBe(0);
});

test('downloadBtn: 포스터가 있으면 파일명을 채운 <a>를 만들어 클릭한다', async () => {
  const app = await loadApp();
  app.state.posters = [makeFakePoster()];
  app.state.selected = 0;

  const clicked = vi.fn();
  const originalCreateElement = app.document.createElement;
  app.document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') el.click = clicked;
    return el;
  };

  app.document.getElementById('downloadBtn').onclick();

  expect(clicked).toHaveBeenCalledTimes(1);
});

test('printBtn: 포스터가 없으면 안내만 하고 인쇄창을 열지 않는다', async () => {
  const app = await loadApp();
  const printSpy = vi.spyOn(app.window, 'print');
  app.document.getElementById('printBtn').onclick();
  expect(app.document.getElementById('status').textContent).toMatch(/먼저 포스터를 만들어/);
  expect(printSpy).not.toHaveBeenCalled();
});

test('printBtn → img.onload → window.print() → afterprint 정리까지 전체 흐름', async () => {
  const app = await loadApp();
  app.state.posters = [makeFakePoster()];
  app.state.selected = 0;
  const printSpy = vi.spyOn(app.window, 'print');

  let capturedImg = null;
  const originalCreateElement = app.document.createElement;
  app.document.createElement = (tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'img') capturedImg = el;
    return el;
  };

  app.document.getElementById('printBtn').onclick();

  const area = app.document.body.appended.at(-1);
  expect(area.id).toBe('printArea');
  expect(capturedImg.src).toBe('data:image/png;base64,FAKE_POSTER');

  // 실제 브라우저라면 이미지가 로드된 뒤 비동기로 오는 이벤트 — 여기서 직접 발화.
  capturedImg.onload();
  expect(printSpy).toHaveBeenCalledTimes(1);

  // afterprint 핸들러는 $('printArea')(=document.getElementById)로 다시 찾아서
  // remove()를 부른다 — 실제 브라우저라면 방금 만든 그 div를 정확히 찾아내지만,
  // 이 가짜 document는 id 속성을 나중에 손으로 채운 엘리먼트까지 추적하지는
  // 않는다(생성 시점에 getElementById로 등록된 것만 캐싱). 그래서 여기서 확인할
  // 수 있는 건 "$('printArea')가 가리키는 대상에 remove()가 호출됐는가"까지다.
  expect(app.window._listeners.afterprint).toBeTruthy();
  app.window._listeners.afterprint.forEach((fn) => fn());
  expect(app.document.getElementById('printArea').removed).toBe(true);
});

// 초기화 버튼(2026-09-09 대표 지시 "깔끔하게 안에 쓴 것들 다 없애주는 걸로,
// 촬영은 남기고"). 🔴 이 테스트의 핵심은 **사진이 남는지**다 — 그게 `다시 촬영`과
// 초기화를 가르는 유일한 차이라서, 여기가 무너지면 아이가 다시 찍어야 한다.
import { test, expect } from 'vitest';
import { loadApp } from './load-app.js';

/** 개인/단체 스위치를 흉내낸다 — 실제 화면에는 버튼 2개가 있다. */
function installModeSeg(app) {
  const clicked = [];
  const mk = (mode) => ({ dataset: { mode }, click() { clicked.push(mode); } });
  app.document.getElementById('modeSeg').querySelectorAll = () => [mk('solo'), mk('group')];
  return clicked;
}

async function 채워놓기(app) {
  const clicked = installModeSeg(app);
  for (const id of ['studentName', 'groupName', 'members', 'movieTitle']) {
    app.document.getElementById(id).value = '무언가';
  }
  app.document.getElementById('genre').value = 'mystery';
  app.document.getElementById('genre').selectedIndex = 4;
  app.state.capturedBlob = new Blob(['사진'], { type: 'image/jpeg' });
  app.state.posters = [{ label: '클래식', canvas: null }, { label: '네온', canvas: null }];
  app.state.selected = 1;
  app.state.genCount = 2;
  app.state.pendingMeta = { genre: 'mystery' };
  app.document.getElementById('status').textContent = '무언가 진행 중…';
  return clicked;
}

test('초기화: 입력·장르·포스터를 지운다', async () => {
  const app = await loadApp();
  await 채워놓기(app);
  app.document.getElementById('resetBtn').onclick();
  for (const id of ['studentName', 'groupName', 'members', 'movieTitle']) {
    expect(app.document.getElementById(id).value).toBe('');
  }
  expect(app.document.getElementById('genre').selectedIndex).toBe(0);
  expect(app.state.posters).toEqual([]);
  expect(app.state.selected).toBe(0);
  expect(app.state.genCount).toBe(0);
  expect(app.state.pendingMeta).toBe(null);
  expect(app.document.getElementById('status').textContent).toBe('');
});

test('🔴 초기화: 촬영한 사진은 남긴다 — `다시 촬영`과 정반대다', async () => {
  const app = await loadApp();
  await 채워놓기(app);
  const 찍은사진 = app.state.capturedBlob;
  app.document.getElementById('resetBtn').onclick();
  expect(app.state.capturedBlob).toBe(찍은사진);
});

test('초기화: 개인/단체를 개인으로 되돌린다(camera.js의 기존 핸들러를 태워서)', async () => {
  const app = await loadApp();
  const clicked = await 채워놓기(app);
  app.document.getElementById('resetBtn').onclick();
  expect(clicked).toEqual(['solo']);
});

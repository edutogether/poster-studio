// "한 장의 사진당 최초 생성 1회 + 재생성 1회, 총 2회"라는 대표 확정 비즈니스 규칙
// (public/api.js의 genCount/MAX_GENERATIONS_PER_PHOTO)을 회귀 테스트로 고정한다.
// 5차 감사 발견: 이전엔 브라우저에서 fetch를 목(mock)으로 바꿔 수동으로 한 번
// 확인한 게 전부였고, 자동화된 회귀 테스트가 없어 다음 수정 때 조용히 깨질 수
// 있었다. ES모듈 전환(2026-08-30) 이후로는 state.js가 내보내는 state 객체가
// 모듈 그래프 전체에서 공유되는 라이브 바인딩이라, app.state.capturedBlob/
// genCount에 직접 접근해 실제 generateBtn/regenBtn 클릭 핸들러를 그대로
// 실행시켜 검증한다(예전의 vm __eval 우회가 더는 필요 없다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load-app.js';

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('genCount: 1차 생성 성공 후 재생성 버튼이 활성 상태를 유지한다', async () => {
  const app = await loadApp();
  app.fetch = async () => ({
    ok: true,
    json: async () => ({ images: [TINY_PNG_DATA_URL], meta: {} })
  });
  app.document.getElementById('studentName').value = '테스트';
  app.document.getElementById('movieTitle').value = '테스트영화';
  app.state.capturedBlob = { size: 3 };

  await app.document.getElementById('generateBtn').onclick();

  assert.equal(app.state.genCount, 1);
  assert.equal(app.document.getElementById('regenBtn').disabled, false);
});

test('genCount: 2차(재생성) 후에는 재생성 버튼이 비활성화된다', async () => {
  const app = await loadApp();
  app.fetch = async () => ({
    ok: true,
    json: async () => ({ images: [TINY_PNG_DATA_URL], meta: {} })
  });
  app.document.getElementById('studentName').value = '테스트';
  app.document.getElementById('movieTitle').value = '테스트영화';
  app.state.capturedBlob = { size: 3 };

  await app.document.getElementById('generateBtn').onclick(); // 1차
  await app.document.getElementById('generateBtn').onclick(); // 2차(재생성)

  assert.equal(app.state.genCount, 2);
  assert.equal(app.document.getElementById('regenBtn').disabled, true);
});

test('genCount: 한도(2회)를 넘긴 3차 시도는 서버에 요청조차 안 보내고 즉시 차단된다', async () => {
  const app = await loadApp();
  let fetchCallCount = 0;
  app.fetch = async () => {
    fetchCallCount++;
    return { ok: true, json: async () => ({ images: [TINY_PNG_DATA_URL], meta: {} }) };
  };
  app.document.getElementById('studentName').value = '테스트';
  app.document.getElementById('movieTitle').value = '테스트영화';
  app.state.capturedBlob = { size: 3 };

  await app.document.getElementById('generateBtn').onclick(); // 1차
  await app.document.getElementById('generateBtn').onclick(); // 2차
  await app.document.getElementById('generateBtn').onclick(); // 3차 — 차단돼야 함

  assert.equal(fetchCallCount, 2, '3번째는 fetch 자체가 호출되면 안 된다');
  assert.equal(app.state.genCount, 2);
  assert.match(app.document.getElementById('status').textContent, /재생성 횟수를 모두 사용/);
});

test('genCount: 다시 촬영하면(retakeBtn) 카운트가 초기화되고 재생성 버튼이 다시 활성화된다', async () => {
  const app = await loadApp();
  app.fetch = async () => ({
    ok: true,
    json: async () => ({ images: [TINY_PNG_DATA_URL], meta: {} })
  });
  app.document.getElementById('studentName').value = '테스트';
  app.document.getElementById('movieTitle').value = '테스트영화';
  app.state.capturedBlob = { size: 3 };

  await app.document.getElementById('generateBtn').onclick(); // 1차
  await app.document.getElementById('generateBtn').onclick(); // 2차 — 한도 도달

  app.document.getElementById('retakeBtn').onclick();

  assert.equal(app.state.genCount, 0);
  assert.equal(app.document.getElementById('regenBtn').disabled, false);
});

test('genCount: regenBtn은 결과가 없으면(posters 비어있음) 아무 동작도 안 한다', async () => {
  const app = await loadApp();
  let fetchCalled = false;
  app.fetch = async () => { fetchCalled = true; return { ok: true, json: async () => ({ images: [], meta: {} }) }; };

  app.document.getElementById('regenBtn').onclick();

  assert.equal(fetchCalled, false);
});

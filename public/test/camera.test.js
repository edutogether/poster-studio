// camera.js(웹캠 촬영)는 8차 종합감사(2026-09-30) 시점까지 테스트가 0개였다 —
// getUserMedia/canvas.toBlob 같은 브라우저 전용 API에 의존해서 기존
// zero-dependency 하네스로는 못 다룬다고 여겨졌으나, load-app.js에 fake
// canvas.toBlob()을 추가하는 것만으로 실제 캡처 로직(카운트다운, 좌우反전
// 미러링, blob 생성, 스트림 정지, genCount 리셋)을 그대로 호출해 검증할 수
// 있었다. 실제 프로덕션 함수(startCamera, startBtn/shotBtn/retakeBtn 클릭
// 핸들러)를 그대로 실행한다 — 로직을 베껴 재구현한 가짜 검증이 아니다.
import { test, expect, vi } from 'vitest';
import { loadApp } from './load-app.js';

test('startCamera: getUserMedia 성공 시 스트림을 연결하고 안내 문구를 바꾼다', async () => {
  const app = await loadApp();
  await app.startCamera();
  expect(app.state.stream).toBeTruthy();
  expect(app.document.getElementById('status').textContent).toMatch(/촬영/);
});

test('startBtn: 카메라 권한이 거부되면 안내 문구를 보여준다', async () => {
  const app = await loadApp();
  app.navigator.mediaDevices.getUserMedia = async () => { throw new Error('Permission denied'); };
  await app.document.getElementById('startBtn').onclick();
  expect(app.document.getElementById('status').textContent).toMatch(/권한/);
});

test('shotBtn: 카메라가 아직 준비 안 됐으면(videoWidth=0) 촬영을 막고 안내한다', async () => {
  vi.useFakeTimers();
  try {
    const app = await loadApp();
    await app.startCamera();
    // video.videoWidth를 일부러 안 채운다(makeElement 기본값 = undefined) —
    // 카운트다운은 videoWidth 체크보다 먼저라 실제 타이머가 3초 이상 걸린다.
    const clickPromise = app.document.getElementById('shotBtn').onclick();
    await vi.advanceTimersByTimeAsync(3100);
    await clickPromise;
    expect(app.state.capturedBlob).toBe(null);
    expect(app.document.getElementById('status').textContent).toMatch(/준비 중/);
  } finally {
    vi.useRealTimers();
  }
});

test('shotBtn: 정상 촬영하면 capturedBlob이 채워지고 카메라 스트림이 꺼진다', async () => {
  vi.useFakeTimers();
  try {
    const app = await loadApp();
    await app.startCamera();
    app.video.videoWidth = 640;
    app.video.videoHeight = 480;

    const clickPromise = app.document.getElementById('shotBtn').onclick();
    await vi.advanceTimersByTimeAsync(3100); // 카운트다운 3·2·1(800ms×3) + 📸 표시(250ms)
    await clickPromise;

    expect(app.state.capturedBlob).toBeTruthy();
    expect(app.state.stream).toBe(null);
    expect(app.document.getElementById('snapshot').classList.contains('hidden')).toBe(false);
    expect(app.state.genCount).toBe(0);
    expect(app.document.getElementById('regenBtn').disabled).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('shotBtn: 카메라가 꺼져 있으면 먼저 켠 뒤 이어서 촬영한다', async () => {
  vi.useFakeTimers();
  try {
    const app = await loadApp();
    // startCamera()를 미리 부르지 않는다 — shotBtn 스스로 켜야 한다.
    app.video.videoWidth = 640;
    app.video.videoHeight = 480;

    const clickPromise = app.document.getElementById('shotBtn').onclick();
    await vi.advanceTimersByTimeAsync(3100);
    await clickPromise;

    expect(app.state.capturedBlob).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('retakeBtn: 다시 촬영을 누르면 capturedBlob/재생성 상태가 초기화되고 카메라가 다시 켜진다', async () => {
  const app = await loadApp();
  app.state.capturedBlob = { size: 3 };
  app.state.genCount = 2;
  await app.document.getElementById('retakeBtn').onclick();
  expect(app.state.capturedBlob).toBe(null);
  expect(app.state.genCount).toBe(0);
  expect(app.state.stream).toBeTruthy(); // startCamera()가 다시 호출돼 스트림이 채워짐
});

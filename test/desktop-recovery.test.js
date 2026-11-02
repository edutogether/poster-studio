/* 설치판 화면 지키기(desktop/recovery.mjs, 2026-11-02 종합감사) — 화면(렌더러)이 죽거나 · 멈추거나 · 앱 첫 화면을 못 읽으면
   빈 창으로 두지 않고 다시 읽는다. 짧은 간격에 되풀이되면 멈추고 안내한다. Electron 없이 가짜 webContents로 시험한다. */
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  watchRenderer, createReloadGate,
  RELOAD_LIMIT, RELOAD_WINDOW_MS, RELOAD_DELAY_MS, UNRESPONSIVE_GRACE_MS,
} from '../desktop/recovery.mjs';

const HOME = 'app://studio/';
let contents, calls, busy;
const fakeContents = () => {
  const c = new EventEmitter();
  c.destroyed = false;
  c.isDestroyed = () => c.destroyed;
  c.forcefullyCrashRenderer = vi.fn(() => c.emit('render-process-gone', {}, { reason: 'killed', exitCode: 1 }));
  return c;
};
beforeEach(() => {
  vi.useFakeTimers();
  contents = fakeContents();
  calls = { reload: 0, giveUp: 0, log: [] };
  busy = false;
  watchRenderer(contents, {
    home: HOME,
    reload: () => { calls.reload += 1; },
    giveUp: () => { calls.giveUp += 1; },
    log: (line) => calls.log.push(line),
    isBusy: () => busy,
  });
});
afterEach(() => vi.useRealTimers());

const crash = (reason = 'crashed') => contents.emit('render-process-gone', {}, { reason, exitCode: -1073741819 });
const failLoad = (code = -6, url = HOME, mainFrame = true) => contents.emit('did-fail-load', {}, code, 'ERR_FILE_NOT_FOUND', url, mainFrame);

describe('죽거나 못 읽으면 첫 화면을 다시 읽는다', () => {
  test.each([['crashed'], ['killed'], ['oom'], ['abnormal-exit'], ['launch-failed']])('화면 프로세스 끝남(%s) → 원인 기록 · 잠깐 뒤 다시 읽기', (reason) => {
    crash(reason);
    expect(calls.log.join('\n')).toContain(reason);
    expect(calls.reload).toBe(0);   // 바로 읽지 않는다
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(calls.reload).toBe(1);
    expect(calls.giveUp).toBe(0);
  });

  test('창을 닫을 때의 정상 종료(clean-exit)는 다시 읽지 않는다', () => {
    crash('clean-exit');
    vi.advanceTimersByTime(RELOAD_WINDOW_MS);
    expect(calls).toEqual({ reload: 0, giveUp: 0, log: [] });
  });

  test('앱 첫 화면(본 화면)을 못 읽으면 다시 읽는다', () => {
    failLoad(-6, `${HOME}index.html`);
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(calls.reload).toBe(1);
    expect(calls.log[0]).toMatch(/-6 ERR_FILE_NOT_FOUND app:\/\/studio\/index\.html/);
  });

  test.each([
    ['다른 이동에 끊김(-3)', -3, HOME, true],
    ['안쪽 틀', -6, HOME, false],
    ['앱 밖 주소', -6, 'https://example.com/', true],
  ])('%s 은 실패로 치지 않는다', (_name, code, url, mainFrame) => {
    failLoad(code, url, mainFrame);
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(calls.reload).toBe(0);
    expect(calls.log).toEqual([]);
  });

  test('창이 이미 닫혔으면(파괴됨) 아무것도 하지 않는다 — 기다리는 사이 닫혀도', () => {
    crash();
    contents.destroyed = true;
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(calls.reload).toBe(0);
    crash();
    expect(calls.log.length).toBe(1);
  });
});

describe('짧은 간격에 되풀이되면 멈추고 안내한다', () => {
  test(`${RELOAD_WINDOW_MS / 1000}초 안에 ${RELOAD_LIMIT}번 다시 읽고, 그다음 실패에서 안내 창 한 번 — 그 뒤로는 읽지도 안내하지도 않는다`, () => {
    for (let i = 0; i < RELOAD_LIMIT; i++) { crash(); vi.advanceTimersByTime(RELOAD_DELAY_MS); }
    expect(calls.reload).toBe(RELOAD_LIMIT);
    expect(calls.giveUp).toBe(0);
    failLoad();
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(calls.reload).toBe(RELOAD_LIMIT);
    expect(calls.giveUp).toBe(1);
    expect(calls.log.at(-1)).toMatch(/멈춤/);
    crash(); failLoad();
    vi.advanceTimersByTime(RELOAD_WINDOW_MS * 2);
    expect(calls.reload).toBe(RELOAD_LIMIT);
    expect(calls.giveUp).toBe(1);
  });

  test('띄엄띄엄 실패하면(간격이 기준보다 길면) 계속 다시 읽는다', () => {
    for (let i = 0; i < RELOAD_LIMIT * 3; i++) { crash(); vi.advanceTimersByTime(RELOAD_WINDOW_MS / (RELOAD_LIMIT - 1)); }
    expect(calls.reload).toBe(RELOAD_LIMIT * 3);
    expect(calls.giveUp).toBe(0);
  });

  test('다시 읽기 문지기: 시간 창이 지나면 다시 열린다', () => {
    let t = 0;
    const gate = createReloadGate({ limit: 2, windowMs: 1000, now: () => t });
    expect([gate(), gate(), gate()]).toEqual([true, true, false]);
    t = 999;
    expect(gate()).toBe(false);
    t = 1000;
    expect(gate()).toBe(true);
  });
});

describe('멈추면(응답 없음) 조금 더 기다린 뒤 끊고 다시 읽는다', () => {
  test(`응답 없음이 ${UNRESPONSIVE_GRACE_MS / 1000}초 더 이어지면 화면 프로세스를 끊고 → 다시 읽기`, () => {
    contents.emit('unresponsive');
    vi.advanceTimersByTime(UNRESPONSIVE_GRACE_MS - 1);
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(contents.forcefullyCrashRenderer).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(RELOAD_DELAY_MS);
    expect(calls.reload).toBe(1);
    expect(calls.log.join('\n')).toMatch(/응답 없음[\s\S]*끊음[\s\S]*killed/);
  });

  test('그 사이 응답이 돌아오면 끊지 않는다 · 응답 없음이 겹쳐 와도 한 번만 기다린다', () => {
    contents.emit('unresponsive');
    contents.emit('unresponsive');
    vi.advanceTimersByTime(UNRESPONSIVE_GRACE_MS / 2);
    contents.emit('responsive');
    vi.advanceTimersByTime(UNRESPONSIVE_GRACE_MS * 3);
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    expect(calls.reload).toBe(0);
    expect(calls.log).toEqual(['화면 응답 없음', '화면 응답 돌아옴']);
  });

  test('인쇄 창이 열려 있는 동안은 끊지 않고 다시 기다린다 — 닫힌 뒤에도 멈춰 있으면 끊는다', () => {
    busy = true;
    contents.emit('unresponsive');
    vi.advanceTimersByTime(UNRESPONSIVE_GRACE_MS * 5);
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    busy = false;
    vi.advanceTimersByTime(UNRESPONSIVE_GRACE_MS);
    expect(contents.forcefullyCrashRenderer).toHaveBeenCalledTimes(1);
  });

  test('화면 프로세스가 먼저 죽으면 기다리던 끊기는 취소된다(두 번 읽지 않는다)', () => {
    contents.emit('unresponsive');
    crash();
    vi.advanceTimersByTime(UNRESPONSIVE_GRACE_MS + RELOAD_DELAY_MS);
    expect(contents.forcefullyCrashRenderer).not.toHaveBeenCalled();
    expect(calls.reload).toBe(1);
  });
});

test('main.mjs가 본 창의 화면에 이 지킴이를 건다 — 다시 읽기 · 안내 · 기록 · 인쇄 중 기다리기', () => {
  const main = fs.readFileSync('desktop/main.mjs', 'utf8');
  expect(main).toMatch(/watchRenderer\(win\.webContents, \{ home, reload: open, giveUp: \(\) => giveUp\(win\), log, isBusy: \(\) => printing > 0 \}\)/);
  expect(main).toMatch(/const open = \(\) => win\.loadURL\(home\)\.catch\(\(\) => \{\}\);/);
  expect(main).toMatch(/printing \+= 1;\s*try \{[\s\S]*?\} finally \{\s*printing -= 1;/);
});

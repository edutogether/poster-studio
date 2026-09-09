// @vitest-environment jsdom
/* ────────────────────────────────────────────────────────────────────
   PosterStudio 컴포넌트 테스트 — 3단계 React 전환(2026-09-09).

   예전 camera.test.js(6) · print.test.js(4) · regen-limit.test.js(5)가 검증하던
   행동을 **같은 행동 그대로** React 위에서 다시 검증한다. 그 세 파일은 이제
   화면에 연결되지 않은 모듈을 보고 있어서, 통과해도 아무것도 증명하지 못했다.

   여기에 전환이 새로 만든 위험 세 가지를 **되돌리면 실패하는 형태로** 고정한다:
     D 카메라를 안 끄면 실패한다
     E StrictMode에서 캔버스를 두 번 그리면 실패한다
     F ResizeObserver가 오른쪽(자기가 바꾸는 쪽)을 관찰하면 실패한다
   ──────────────────────────────────────────────────────────────────── */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, act, cleanup } from '@testing-library/react';
import PosterStudio from '../src/PosterStudio.js';
import { heightToApply, TWO_COL_MIN_WIDTH } from '../src/useLayoutMatch.js';
import {
  installCanvas, installCamera, installFetch, installImage, installFonts,
  installObjectURL, makeVideoReady, makeAppContainer
} from './react-setup.js';

let canvasContexts: any[];
let cam: ReturnType<typeof installCamera>;
let objectUrls: ReturnType<typeof installObjectURL>;

beforeEach(() => {
  canvasContexts = installCanvas();
  cam = installCamera();
  objectUrls = installObjectURL();
  installImage();
  installFonts();
  installFetch();
  makeAppContainer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  /* 스파이를 반드시 되돌린다. 안 되돌리면 다음 테스트의
     `document.createElement.bind(document)`가 **이전 테스트의 스파이**를 붙잡고,
     그 위에 새 스파이를 씌우면서 서로를 부르는 무한 재귀가 된다(실제로 겪음 —
     "Maximum call stack size exceeded"로 뒤따르는 테스트 3개가 같이 무너졌다). */
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** 3·2·1 카운트다운(800×3 + 250ms)을 가짜 타이머로 지나가게 한다. */
async function runCountdown() {
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
}

/** 카메라 켜기 → 촬영까지. 실제 버튼을 누르는 경로 그대로 간다. */
async function shoot() {
  await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
  makeVideoReady(el<HTMLVideoElement>('video'));
  vi.useFakeTimers();
  await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
  await runCountdown();
  vi.useRealTimers();
  await act(async () => { await Promise.resolve(); });
}

function renderApp(strict = false) {
  const ui = strict ? <StrictMode><PosterStudio /></StrictMode> : <PosterStudio />;
  return render(ui, { container: document.querySelector('main.app') as HTMLElement });
}

/* ───────────────────── 카메라 (예전 camera.test.js) ───────────────────── */
describe('카메라', () => {
  test('카메라 켜기: 스트림을 연결하고 안내 문구를 바꾼다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(el('status').textContent).toContain('카메라 준비 완료');
  });

  test('카메라 켜기: 권한이 거부되면 안내 문구를 보여준다', async () => {
    (navigator.mediaDevices.getUserMedia as any) = vi.fn(async () => { throw new Error('NotAllowed'); });
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(el('status').textContent).toContain('카메라 권한을 허용해 주세요');
  });

  test('촬영: 카메라가 아직 준비 안 됐으면(videoWidth=0) 막고 안내한다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await runCountdown();
    vi.useRealTimers();
    expect(el('status').textContent).toContain('카메라가 아직 준비 중');
  });

  test('촬영: 정상 촬영하면 미리보기가 뜨고 안내 문구가 바뀐다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    expect(el('status').textContent).toContain('촬영 완료');
    expect(el('snapshot').className).not.toContain('hidden');
    expect(el<HTMLImageElement>('snapshot').getAttribute('src')).toBe(objectUrls.created[0]);
    expect(el('video').className).toContain('hidden');
  });

  test('촬영: 카메라가 꺼져 있으면 먼저 켠 뒤 이어서 촬영한다', async () => {
    await act(async () => { renderApp(); });
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    makeVideoReady(el<HTMLVideoElement>('video'));
    await runCountdown();
    vi.useRealTimers();
    await act(async () => { await Promise.resolve(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(el('status').textContent).toContain('촬영 완료');
  });

  test('다시 촬영: 미리보기가 사라지고 카메라가 다시 켜진다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('retakeBtn').click(); });
    expect(el('video').className).not.toContain('hidden');
    expect(el('snapshot').className).toContain('hidden');
    expect(el('status').textContent).toContain('카메라 준비 완료');
  });
});

/* ───────── 위험 D — 촬영 후에도, 화면을 떠날 때도 카메라를 끈다 ───────── */
describe('위험 D: 카메라 스트림 정지', () => {
  test('촬영이 끝나면 스트림 트랙을 실제로 stop() 한다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    expect(cam.stopped).toEqual(['video']);
  });

  test('화면이 언마운트되면(정리 함수) 켜져 있던 카메라를 끈다', async () => {
    const view = await act(async () => renderApp());
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(cam.stopped).toEqual([]);          // 아직 켜져 있어야 한다
    await act(async () => { view.unmount(); });
    expect(cam.stopped).toEqual(['video']);   // 떠날 때 꺼져야 한다
  });
});

/* ───────── 위험 E — StrictMode에서도 플레이스홀더는 한 번만 ───────── */
describe('위험 E: 초기 캔버스 그리기', () => {
  test('StrictMode에서 효과가 두 번 불려도 플레이스홀더는 정확히 한 번만 그린다', async () => {
    const hide = vi.fn();
    (window as any).__posterStudioHideBootSplash = hide;
    await act(async () => { renderApp(true); });
    // 플레이스홀더를 그렸다는 신호는 스플래시 내림 호출이다 — 두 번 그리면 두 번 불린다.
    expect(hide).toHaveBeenCalledTimes(1);
    const drawn = canvasContexts.filter((c) => c.__fillTextCalls > 0);
    expect(drawn.length).toBe(1);
  });
});

/* ───────── 위험 F — 관찰은 왼쪽, 변경은 오른쪽 ───────── */
describe('위험 F: ResizeObserver 방향', () => {
  test('오른쪽 패널(자기가 높이를 바꾸는 쪽)은 관찰하지 않는다', async () => {
    const observed: Element[] = [];
    class RO {
      constructor(_cb: ResizeObserverCallback) {}
      observe(t: Element) { observed.push(t); }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO);
    await act(async () => { renderApp(); });
    expect(observed.length).toBe(1);
    expect(observed[0].classList.contains('left')).toBe(true);
    // 이게 깨지면(오른쪽을 관찰하면) 높이 변경이 관찰을 다시 부르며 폭주한다.
    for (const t of observed) expect(t.querySelector('#posterCanvas')).toBe(null);
  });

  test('모바일 폭에서는 높이를 비우고, 데스크톱 폭에서는 왼쪽 높이를 그대로 꽂는다', () => {
    expect(heightToApply(TWO_COL_MIN_WIDTH, 700)).toBe('');
    expect(heightToApply(TWO_COL_MIN_WIDTH - 1, 700)).toBe('');
    expect(heightToApply(TWO_COL_MIN_WIDTH + 1, 700)).toBe('700px');
    expect(heightToApply(1366, 812)).toBe('812px');
  });
});

/* ───────────────── 재생성 한도 (예전 regen-limit.test.js) ───────────────── */
describe('재생성 한도', () => {
  const generate = async () => {
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { await Promise.resolve(); });
  };

  test('1차 생성 뒤에도 재생성 버튼은 살아 있다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    await generate();
    expect(el<HTMLButtonElement>('regenBtn').disabled).toBe(false);
  });

  test('2차(재생성)까지 쓰면 재생성 버튼이 잠기고 문구가 바뀐다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    await generate();
    await act(async () => { el<HTMLButtonElement>('regenBtn').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(el<HTMLButtonElement>('regenBtn').disabled).toBe(true);
    expect(el('regenBtn').textContent).toContain('소진');
  });

  test('한도를 넘긴 3차 시도는 서버에 요청조차 보내지 않는다', async () => {
    const { calls } = installFetch();
    await act(async () => { renderApp(); });
    await shoot();
    await generate();
    await generate();
    const before = calls.filter((u) => u.includes('/generate')).length;
    await generate();
    const after = calls.filter((u) => u.includes('/generate')).length;
    expect(before).toBe(2);
    expect(after).toBe(2);                      // 늘지 않아야 한다
    expect(el('status').textContent).toContain('재생성 횟수를 모두 사용');
  });

  test('다시 촬영하면 한도가 초기화된다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    await generate();
    await generate();
    expect(el<HTMLButtonElement>('regenBtn').disabled).toBe(true);
    await act(async () => { el<HTMLButtonElement>('retakeBtn').click(); });
    expect(el<HTMLButtonElement>('regenBtn').disabled).toBe(false);
    expect(el('regenBtn').textContent).not.toContain('소진');
  });

  test('결과가 없으면 재생성 버튼은 아무 것도 안 한다', async () => {
    const { calls } = installFetch();
    await act(async () => { renderApp(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('regenBtn').click(); });
    expect(calls.filter((u) => u.includes('/generate')).length).toBe(0);
  });
});

/* ───────────────── 저장·인쇄 (예전 print.test.js) ───────────────── */
describe('저장·인쇄', () => {
  test('PNG 저장: 포스터가 없으면 안내만 하고 아무 것도 만들지 않는다', async () => {
    await act(async () => { renderApp(); });
    const created: string[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      created.push(tag);
      return realCreate(tag);
    }) as any);
    await act(async () => { el<HTMLButtonElement>('downloadBtn').click(); });
    expect(el('status').textContent).toContain('먼저 포스터를 만들어 주세요');
    expect(created).not.toContain('a');
  });

  test('PNG 저장: 포스터가 있으면 파일명을 채운 <a>를 만들어 클릭한다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { await Promise.resolve(); });
    let anchor: HTMLAnchorElement | null = null;
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const node = realCreate(tag);
      if (tag === 'a') { anchor = node as HTMLAnchorElement; (node as any).click = vi.fn(); }
      return node;
    }) as any);
    await act(async () => { el<HTMLButtonElement>('downloadBtn').click(); });
    expect(anchor).not.toBe(null);
    expect(anchor!.download).toMatch(/^InKY_영화포스터_.+\.png$/);
    expect(anchor!.click).toHaveBeenCalled();
  });

  test('인쇄: 포스터가 없으면 인쇄창을 열지 않는다', async () => {
    const print = vi.fn();
    (window as any).print = print;
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('printBtn').click(); });
    expect(el('status').textContent).toContain('먼저 포스터를 만들어 주세요');
    expect(print).not.toHaveBeenCalled();
    expect(document.getElementById('printArea')).toBe(null);
  });

  test('인쇄: printArea를 만들고 img.onload에서 print(), afterprint에서 걷어낸다', async () => {
    const print = vi.fn();
    (window as any).print = print;
    await act(async () => { renderApp(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { el<HTMLButtonElement>('printBtn').click(); });
    const area = document.getElementById('printArea');
    expect(area).not.toBe(null);
    const img = area!.querySelector('img') as HTMLImageElement;
    expect(img).not.toBe(null);
    expect(print).not.toHaveBeenCalled();      // 이미지가 뜨기 전에는 인쇄하지 않는다
    await act(async () => { img.onload?.(new Event('load') as any); });
    expect(print).toHaveBeenCalled();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.getElementById('printArea')).toBe(null);
  });
});

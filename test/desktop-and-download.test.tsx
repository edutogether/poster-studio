// @vitest-environment jsdom
/* 2026-10-27 — 웹 첫 화면 «↓ 다운로드» 단추와 Windows 설치판 갈래(_docs/intents/2026-10-27-desktop-installer).

   다운로드 단추: 첫 화면(1단계)에만 있고, 누르기 전에는 설치 파일을 하나도 받지 않는다(fetch 0건 · 링크만).
   설치판(src/desktop.ts DESKTOP): AI 없이 찍은 사진으로 8종을 만든다 — 서버 요청 0건(서버 확인 /health도 없다). 카메라를 켜기 전에는
   «샘플 포스터 보기»가 화면의 촬영 구도 예시 사진을 같은 로컬 합성에 넣어 보인다(10/28 — «사진 불러오기»는 걷었다),
   «PC에 저장» · «인쇄 미리보기 → 인쇄하기»(설치판 창구의 print) · 다운로드 단추 대신 «설치판 · AI 없이» 표시.
   실제 브라우저 · 실제 설치판 확인은 scripts/verify/download-button-probe.mjs · desktop-app-probe.mjs. */
import fs from 'node:fs';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import type { StudioMode } from '../src/studioMode.js';
import type { PrintResult } from '../src/desktop.js';
import PosterStudio from '../src/PosterStudio.js';
import * as saveModule from '../src/savePoster.js';
import * as posterModule from '../src/poster.js';
import { approvedCameraVideo } from '../src/studio/cameraVideo.js';
import { DOWNLOADS } from '../src/downloads.js';
import {
  installCanvas, installCamera, installFetch, installImage, installFonts,
  installObjectURL, makeVideoReady, makeAppContainer
} from './react-setup.js';

// vi.mock은 맨 위로 끌어올려진다 — PosterStudio가 모듈을 읽는 순간 DESKTOP을 묻기 때문에 상태도 같이 끌어올린다(vi.hoisted)
const flags = vi.hoisted(() => ({ desktop: false }));
vi.mock('../src/desktop.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/desktop.js')>();
  return { ...real, get DESKTOP() { return flags.desktop; }, desktopBridge: () => (flags.desktop ? (window as any).posterStudioDesktop ?? null : null) };
});
let studioMode: StudioMode = 'both';
vi.mock('../src/studioMode.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/studioMode.js')>()), get STUDIO_MODE() { return studioMode; } }));

let cam: ReturnType<typeof installCamera>;
let net: ReturnType<typeof installFetch>;
beforeEach(() => {
  flags.desktop = false;
  studioMode = 'both';
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  // jsdom의 <dialog>는 모달을 열지 못한다 — 열림 상태만 흉내 낸다
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  installCanvas();
  cam = installCamera();
  installObjectURL();
  installImage();
  installFonts();
  net = installFetch();
  makeAppContainer();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete (window as any).posterStudioDesktop;
});

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const renderApp = () => render(<PosterStudio />, { container: document.querySelector('main.app') as HTMLElement });
const setupRequests = () => net.calls.filter((u) => /Setup\.exe/i.test(u));

describe('웹 첫 화면 «↓ 다운로드»', () => {
  test('1단계에만 있고, 메뉴에 «Poster Studio 설치» 하나만 있다 — 열고 닫는 동안 요청 0건', async () => {
    await act(async () => { renderApp(); });
    const link = document.querySelector('.download-link') as HTMLButtonElement;
    expect(link.textContent).toBe('다운로드');
    expect(link.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.download-menu-list')).toBeNull();   // 누르기 전에는 링크도 문서에 없다
    await act(async () => { link.click(); });
    const items = [...document.querySelectorAll<HTMLAnchorElement>('.download-menu-list a')];
    expect(items.map((a) => a.textContent)).toEqual(['Poster Studio 설치']);   // Voice Cinema 항목은 두지 않는다(10/27 정정)
    expect(items.map((a) => a.getAttribute('href'))).toEqual(DOWNLOADS.map((d) => d.href));
    expect(items.map((a) => a.getAttribute('download'))).toEqual(['PosterStudio-Setup.exe']);
    expect(link.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.download-menu-list')).toBeNull();
    expect(setupRequests()).toEqual([]);
    // 2단계로 가면 없다
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    expect(document.querySelector('.download-link')).toBeNull();
    expect(setupRequests()).toEqual([]);
  });

  test('메뉴 밖을 누르면 닫히고, 항목을 누르면 닫힌다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { (document.querySelector('.download-link') as HTMLButtonElement).click(); });
    fireEvent.pointerDown(document.body);
    expect(document.querySelector('.download-menu-list')).toBeNull();
    await act(async () => { (document.querySelector('.download-link') as HTMLButtonElement).click(); });
    const item = document.querySelector('.download-menu-list a') as HTMLAnchorElement;
    item.addEventListener('click', (e) => e.preventDefault());   // jsdom은 내려받기를 못 한다 — 눌렀을 때 닫히는지만 본다
    await act(async () => { item.click(); });
    expect(document.querySelector('.download-menu-list')).toBeNull();
  });

  test('웹에는 설치판 갈래(표시 · PC에 저장 · 인쇄 미리보기)가 없다', async () => {
    await act(async () => { renderApp(); });
    expect(document.querySelector('.desktop-badge')).toBeNull();
    expect(document.getElementById('desktopSaveBtn')).toBeNull();
    expect(document.querySelector('.print-preview')).toBeNull();
  });
});

describe('설치판(AI 없이 사진 그대로)', () => {
  beforeEach(() => { flags.desktop = true; studioMode = 'both'; });   // src/studioMode.ts — 설치판도 두 단추(10/28)

  /* «이 사진으로 포스터 만들기»(10/27 Bumm님): 로딩 화면이 무작위 장면 둘(8초씩) 동안 돌고 나서 결과로 간다 — «최소 두 바퀴»(COMMON_STANDARDS §27).
     설치판에는 AI가 없으니 «AI …» 문구 장면은 나오지 않는다. 그 밖은 웹 그대로 — 승인된 대기 영상을 튼다(10/27 Bumm님 «승인된 영상과 디자인을 그대로»). */
  const composeWithLoading = async (button = 'generateBtn') => {
    const media = [
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(),
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}),
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}),   // jsdom에는 load()가 없다
    ];
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>(button).click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const wait = document.getElementById('spinner') as HTMLDialogElement;
    expect(wait?.hasAttribute('open')).toBe(true);
    expect(wait.textContent).not.toMatch(/AI/);
    expect(wait.querySelector('video')?.getAttribute('src')).toMatch(/^\/studio\/waiting-v3\/\d{2}-[a-f0-9]{12}\.mp4$/);
    const first = wait.dataset.setId;
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(document.getElementById('spinner')?.dataset.setId).not.toBe(first);   // 둘째 장면
    expect(document.body.dataset.step).toBe('2');                                  // 두 바퀴가 끝나기 전에는 넘어가지 않는다
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    vi.useRealTimers();
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.getElementById('spinner')).toBeNull();
    media.forEach((spy) => spy.mockRestore());
  };

  test('서버에 아무것도 보내지 않는다 — 서버 확인 · 생성 요청 0건, 다운로드 단추 대신 설치판 표시', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { await Promise.resolve(); });
    expect(net.calls).toEqual([]);
    expect(document.querySelector('.desktop-badge')?.textContent).toBe('설치판 · AI 없이 사진 그대로');
    expect(document.querySelector('.download-link')).toBeNull();
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    expect(net.calls).toEqual([]);
  });

  test('찍은 사진으로 8종을 만든다(로딩 화면 장면 둘 뒤) — 서버 요청 0건, 사진은 카메라 화질 그대로', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    makeVideoReady(el<HTMLVideoElement>('video'), 1280, 960);
    const canvases: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => { const e = create(tag); if (tag === 'canvas') canvases.push(e as HTMLCanvasElement); return e; }) as typeof document.createElement);
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    vi.useRealTimers();
    await act(async () => { await Promise.resolve(); });
    expect(canvases[0].width).toBe(1280);   // 웹은 1024로 줄인다(AI 전송용) — 설치판은 인쇄되므로 그대로
    expect(cam.stopped).toEqual(['video']);
    await composeWithLoading();
    expect(document.querySelectorAll('#resultView .style-option.thumb').length).toBe(8);
    expect(net.calls).toEqual([]);
  });

  /* 2단계 두 단추(10/28 Bumm님 «카메라 켜기 전에는 샘플 포스터 보기 — 아이들이 어떤 포스터가 있는지 미리 보고 온다» · «사진 불러오기는 뺀다») */
  test('카메라를 켜기 전 빨간 단추는 «샘플 포스터 보기», 켜면 «3초 뒤 사진 찍기» — «사진 불러오기» 단추 · 파일 고르기 칸은 없다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    expect(el('shotBtn').textContent).toContain('샘플 포스터 보기');
    expect(document.getElementById('loadPhotoBtn')).toBeNull();
    expect(document.querySelector('input[type=file]')).toBeNull();
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    makeVideoReady(el<HTMLVideoElement>('video'));
    expect(el('shotBtn').textContent).toContain('3초 뒤 사진 찍기');
    expect(net.calls).toEqual([]);
  });

  /* 설치판 샘플은 설치판이 실제로 만드는 모습이어야 한다 — 웹의 AI 원화(design-sample)가 아니라 화면의 «촬영 구도 예시» 사진(예시 영상이 승인돼 있으면
     «찰칵» 뒤 마지막 장면, 아니면 정지 그림)을 같은 로컬 합성(buildPosters)에 넣는다. 로딩 화면은 설치판 것(AI 문구 없음), 카메라 · 서버 요청 0건. */
  test.each([['solo'], ['group']])('«샘플 포스터 보기»(%s): 화면의 촬영 구도 예시 사진을 로컬 합성으로 8종에 넣는다 — AI 원화 · AI 문구 · 카메라 · 서버 요청 없음', async (mode) => {
    const build = vi.spyOn(posterModule, 'buildPosters');
    await act(async () => { renderApp(); });
    if (mode === 'group') await act(async () => { (document.querySelector('#modeSeg [data-mode="group"]') as HTMLButtonElement).click(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await composeWithLoading('shotBtn');
    const photo = approvedCameraVideo(mode)?.endStill ?? (mode === 'group' ? '/studio/camera-group.webp' : '/studio/camera-student.webp');
    expect(build).toHaveBeenCalledTimes(1);
    expect(build.mock.calls[0][0]).toEqual([photo]);
    expect(document.querySelectorAll('#resultView .style-option.thumb').length).toBe(8);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(net.calls).toEqual([]);
  });

  test('인쇄는 미리보기부터 — «인쇄하기»에서 설치판 창구 print(4×6)를 부르고, 끝나면 인쇄용 화면을 걷는다 · PC에 저장', async () => {
    let done: (v: { ok: boolean }) => void = () => {};
    const print = vi.fn(() => new Promise<{ ok: boolean }>((r) => { done = r; }));
    (window as any).posterStudioDesktop = { print, onSaveDone: () => () => {} };
    const windowPrint = vi.fn();
    (window as any).print = windowPrint;
    const save = vi.spyOn(saveModule, 'savePoster').mockResolvedValue('downloaded');
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    makeVideoReady(el<HTMLVideoElement>('video'));
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    vi.useRealTimers();
    await act(async () => { await Promise.resolve(); });
    await composeWithLoading();
    // PC에 저장
    await act(async () => { el<HTMLButtonElement>('desktopSaveBtn').click(); });
    expect(save).toHaveBeenCalledTimes(1);
    // 출력 → 미리보기(아직 인쇄 안 함). 마우스로 열면(누름 횟수 1) «인쇄하기» 초점 테두리를 숨기는 표시가 붙고, 창 안에서 키를 누르면 빠진다
    await act(async () => { fireEvent.click(el<HTMLButtonElement>('printBtn'), { detail: 1 }); });
    const preview = document.querySelector('.print-preview') as HTMLDialogElement;
    expect(preview.hasAttribute('open')).toBe(true);
    expect(preview.hasAttribute('data-pointer')).toBe(true);
    fireEvent.keyDown(preview, { key: 'Tab' });
    expect(preview.hasAttribute('data-pointer')).toBe(false);
    expect(document.getElementById('printArea')).toBeNull();
    const printNow = [...preview.querySelectorAll('button')].find((b) => b.textContent?.includes('인쇄하기'))!;
    expect(document.activeElement).toBe(printNow);   // 창이 열리면 초점은 «인쇄하기»(«닫기»가 아니라)
    await act(async () => { printNow.click(); });
    expect(preview.hasAttribute('open')).toBe(false);
    const img = document.querySelector('#printArea img') as HTMLImageElement;
    await act(async () => { img.onload?.(new Event('load') as any); });
    expect(print).toHaveBeenCalledTimes(1);
    expect(windowPrint).not.toHaveBeenCalled();
    expect(document.getElementById('printArea')).not.toBeNull();
    await act(async () => { done({ ok: true }); await new Promise((r) => setTimeout(r, 0)); });
    expect(document.getElementById('printArea')).toBeNull();
    expect(el('status').textContent).toBe('');
    expect(net.calls).toEqual([]);
  });

  /* 저장 · 인쇄 실패는 조용히 사라지지 않는다(11/2 종합감사) — 화면 알림(.studio-status)에 띄운다. 사람이 인쇄 · 저장 창을 닫은 것은 알리지 않는다. */
  const PRINT_FAILED = '인쇄하지 못했어요. 프린터 연결을 확인하고 다시 인쇄해 주세요.';
  const SAVE_FAILED = '포스터를 저장하지 못했어요. 저장할 곳을 확인하고 다시 저장해 주세요.';
  const toResult = async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await composeWithLoading('shotBtn');   // 샘플 포스터 — 3단계까지 가장 짧은 길
    expect(document.body.dataset.step).toBe('3');
  };
  const printOnce = async () => {
    await act(async () => { fireEvent.click(el<HTMLButtonElement>('printBtn'), { detail: 1 }); });
    const preview = document.querySelector('.print-preview') as HTMLDialogElement;
    await act(async () => { [...preview.querySelectorAll('button')].find((b) => b.textContent?.includes('인쇄하기'))!.click(); });
    const img = document.querySelector('#printArea img') as HTMLImageElement;
    await act(async () => { img.onload?.(new Event('load') as any); await new Promise((r) => setTimeout(r, 0)); });
  };
  const toast = () => ({ text: el('status').textContent, shown: !(el('status').parentElement as HTMLElement).hidden });

  test.each([
    ['실패를 돌려받음', (): Promise<PrintResult> => Promise.resolve({ ok: false, reason: 'Print job failed' })],
    ['창구가 거부함', (): Promise<PrintResult> => Promise.reject(new Error('IPC 끊김'))],
  ])('인쇄 %s → 화면 알림 · 인쇄용 화면은 걷는다 — 다음 인쇄가 되면 그 알림만 걷는다', async (_name, fail) => {
    const print = vi.fn(fail);
    (window as any).posterStudioDesktop = { print, onSaveDone: () => () => {} };
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await toResult();
    await printOnce();
    expect(print).toHaveBeenCalledTimes(1);
    expect(toast()).toEqual({ text: PRINT_FAILED, shown: true });
    expect(error).toHaveBeenCalled();
    expect(document.getElementById('printArea')).toBeNull();
    print.mockImplementation(() => Promise.resolve({ ok: true }));
    await printOnce();
    expect(toast()).toEqual({ text: '', shown: false });
    expect(net.calls).toEqual([]);
  });

  test.each([['Print job canceled'], ['cancelled']])('사람이 인쇄 창을 닫음(%s)은 알리지 않는다', async (reason) => {
    (window as any).posterStudioDesktop = { print: vi.fn(() => Promise.resolve({ ok: false, reason })), onSaveDone: () => () => {} };
    await toResult();
    await printOnce();
    expect(toast()).toEqual({ text: '', shown: false });
    expect(document.getElementById('printArea')).toBeNull();
  });

  test('저장이 끊기면(창구가 실패를 알림) 화면 알림 — 다음 저장이 되면 걷고, 화면을 닫으면 그만 듣는다', async () => {
    let listener: ((ok: boolean) => void) | null = null;
    const off = vi.fn(() => { listener = null; });
    (window as any).posterStudioDesktop = { print: vi.fn(), onSaveDone: (l: (ok: boolean) => void) => { listener = l; return off; } };
    const { unmount } = await (async () => { let r: ReturnType<typeof renderApp>; await act(async () => { r = renderApp(); }); return r!; })();
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await composeWithLoading('shotBtn');
    expect(listener).not.toBeNull();
    await act(async () => { listener!(false); });
    expect(toast()).toEqual({ text: SAVE_FAILED, shown: true });
    await act(async () => { listener!(true); });
    expect(toast()).toEqual({ text: '', shown: false });
    unmount();
    expect(off).toHaveBeenCalledTimes(1);
  });
});

/* 샘플 흐름(웹 · 설치판)과 설치판 «포스터 만들기»는 같은 순서(PosterStudio.tsx composeWhileWaiting)를 쓴다(11/2 종합감사 — 예전 샘플은 오류를 삼켰다).
   조판이 실패하면 원인을 콘솔에 남기고 화면 알림을 띄우며, 로딩 화면은 닫히고 2단계에 남는다. */
describe('조판 실패 — 샘플 · 설치판 포스터 만들기', () => {
  const failBuild = () => {
    vi.spyOn(posterModule, 'buildPosters').mockRejectedValue(new Error('조판 실패'));
    return vi.spyOn(console, 'error').mockImplementation(() => {});
  };
  // 웹 샘플은 원화를 동적으로 불러온 뒤 조판한다 — 알림이 뜨거나 2초가 될 때까지 기다린다
  const flush = () => act(async () => { for (let i = 0; i < 200 && !el('status').textContent; i++) await new Promise((r) => setTimeout(r, 10)); });

  test.each([['웹', false], ['설치판', true]])('%s «샘플 포스터 보기»', async (_name, desktop) => {
    flags.desktop = desktop;
    const error = failBuild();
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await flush();
    expect(el('status').textContent).toBe('샘플 포스터를 불러오지 못했어요. 다시 눌러주세요.');
    expect(error).toHaveBeenCalledWith('[샘플 포스터 실패]', expect.any(Error));
    expect(document.getElementById('spinner')).toBeNull();
    expect(document.body.dataset.step).toBe('2');
    expect(el<HTMLButtonElement>('shotBtn').disabled).toBe(false);   // 다시 누를 수 있다(생성 중 표시가 풀림)
  });

  test('설치판 «이 사진으로 포스터 만들기»', async () => {
    flags.desktop = true;
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    makeVideoReady(el<HTMLVideoElement>('video'));
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    vi.useRealTimers();
    const error = failBuild();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await flush();
    expect(el('status').textContent).toBe('포스터를 만들지 못했어요. 다시 눌러 주세요.');
    expect(error).toHaveBeenCalledWith('[포스터 만들기 실패] 로컬 합성', expect.any(Error));
    expect(document.getElementById('spinner')).toBeNull();
    expect(document.body.dataset.step).toBe('2');
    expect(net.calls).toEqual([]);
  });
});

describe('설치판 화면 규칙(src/desktop.css)', () => {
  const css = fs.readFileSync('src/desktop.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  test('인쇄용 그림(#printArea)은 화면에서 자리를 차지하지 않는다 — 인쇄 때만(studio.css @media print) 보인다', () => {
    // 이 규칙이 없으면 «인쇄하기»를 누르는 순간 문서가 길어져 세로 스크롤바가 생기고 화면이 왼쪽으로 밀린다(10/27 — desktop-print-shift.mjs)
    expect(css).toMatch(/@media screen\s*\{\s*#printArea\s*\{\s*display:\s*none;\s*\}\s*\}/);
  });
  test('마우스로 연 인쇄 미리보기는 «인쇄하기» 초점 테두리를 그리지 않는다', () => {
    expect(css).toMatch(/\.print-preview\[data-pointer\] \.primary-button:focus-visible\s*\{\s*outline:\s*none;/);
  });
  // 2단계 «오늘 촬영할 영화» 창 크기 배치는 10/31 웹에도 넣으며 studio.css로 옮겼다(test/step2-film-layout.test.ts) — 여기 다시 두면 설치판만 갈린다
  test('2단계 창 크기 배치 규칙이 설치판 전용 파일에 남아 있지 않다', () => {
    expect(css).not.toMatch(/camera-film|camera-ticket|page-heading|camera-tips/);
  });
});

test('인쇄 미리보기 «인쇄하기»는 대화 상자 공통 위 여백(20px)을 쓰지 않는다 — «닫기»와 한 줄(10/27)', () => {
  const css = fs.readFileSync('src/desktop.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(css).toMatch(/\.print-preview-actions \.primary-button\s*\{[^}]*margin-top:\s*0;/);
  expect(css).toMatch(/\.print-preview-actions \.back-button\s*\{[^}]*height:\s*52px;/);
});

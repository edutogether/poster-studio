// @vitest-environment jsdom
/* 2026-10-27 — 웹 첫 화면 «↓ 다운로드» 단추와 Windows 설치판 갈래(_docs/intents/2026-10-27-desktop-installer).

   다운로드 단추: 첫 화면(1단계)에만 있고, 누르기 전에는 설치 파일을 하나도 받지 않는다(fetch 0건 · 링크만).
   설치판(src/desktop.ts DESKTOP): AI 없이 찍거나 불러온 사진으로 8종을 만든다 — 서버 요청 0건(서버 확인 /health도 없다),
   «PC에 저장» · «인쇄 미리보기 → 인쇄하기»(설치판 창구의 print) · 다운로드 단추 대신 «설치판 · AI 없이» 표시.
   실제 브라우저 · 실제 설치판 확인은 scripts/verify/download-button-probe.mjs · desktop-app-probe.mjs. */
import fs from 'node:fs';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import type { StudioMode } from '../src/studioMode.js';
import PosterStudio from '../src/PosterStudio.js';
import * as saveModule from '../src/savePoster.js';
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

  test('웹에는 설치판 갈래(표시 · 사진 불러오기 · PC에 저장 · 인쇄 미리보기)가 없다', async () => {
    await act(async () => { renderApp(); });
    expect(document.querySelector('.desktop-badge')).toBeNull();
    expect(document.getElementById('loadPhotoBtn')).toBeNull();
    expect(document.getElementById('desktopSaveBtn')).toBeNull();
    expect(document.querySelector('.print-preview')).toBeNull();
  });
});

describe('설치판(AI 없이 사진 그대로)', () => {
  beforeEach(() => { flags.desktop = true; studioMode = 'real'; });

  /* «이 사진으로 포스터 만들기»(10/27 Bumm님): 로딩 화면이 무작위 장면 둘(8초씩) 동안 돌고 나서 결과로 간다 — «최소 두 바퀴»(COMMON_STANDARDS §27).
     설치판에는 AI가 없으니 «AI …» 문구 장면은 나오지 않는다. 그 밖은 웹 그대로 — 승인된 대기 영상을 튼다(10/27 Bumm님 «승인된 영상과 디자인을 그대로»). */
  const composeWithLoading = async () => {
    const media = [
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(),
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}),
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}),   // jsdom에는 load()가 없다
    ];
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
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
    expect(document.body.textContent).not.toContain('샘플 포스터 보기');
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

  test('«사진 불러오기»로 고른 사진으로 8종을 만든다 — 긴 변 1920으로 줄여 담는다', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    const input = document.querySelector('#loadPhotoBtn ~ input[type=file]') as HTMLInputElement;
    expect(input.accept).toBe('image/jpeg,image/png,image/webp');
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    const canvases: HTMLCanvasElement[] = [];
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => { const e = create(tag); if (tag === 'canvas') canvases.push(e as HTMLCanvasElement); return e; }) as typeof document.createElement);
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect([canvases[0].width, canvases[0].height]).toEqual([1920, 1440]);
    expect(el('snapshot').className).toBe('');
    await composeWithLoading();
    expect(document.querySelectorAll('#resultView .style-option.thumb').length).toBe(8);
    expect(net.calls).toEqual([]);
  });

  test('사진으로 열 수 없는 파일이면 알리고 사진을 바꾸지 않는다', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode'); }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    const input = document.querySelector('#loadPhotoBtn ~ input[type=file]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(['x'], 'a.heic')] } }); });
    expect(el('status').textContent).toContain('사진으로 열 수 없어요');
    expect(el('snapshot').className).toBe('hidden');
  });

  test('인쇄는 미리보기부터 — «인쇄하기»에서 설치판 창구 print(4×6)를 부르고, 끝나면 인쇄용 화면을 걷는다 · PC에 저장', async () => {
    let done: (v: { ok: boolean }) => void = () => {};
    const print = vi.fn(() => new Promise<{ ok: boolean }>((r) => { done = r; }));
    (window as any).posterStudioDesktop = { print };
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
    await act(async () => { done({ ok: true }); await Promise.resolve(); });
    expect(document.getElementById('printArea')).toBeNull();
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
  /* 2단계 낮은 창 · 아주 높은 창의 세로형 티켓은 태블릿 세로 배치의 승인된 규칙을 그대로 옮긴 것이다(10/27 Bumm님 «패드에 사용했던 세로형 티켓»).
     한쪽만 고쳐 두 티켓 모양이 갈리지 않게, 규칙(선택자 · 선언)이 하나도 빠짐없이 같은지 본다. */
  test('세로형 티켓 규칙 = 태블릿 세로 배치(studio.css)의 규칙 그대로', () => {
    const rules = (text: string, prefix: string) => [...text.matchAll(new RegExp(`${prefix}(#cameraWorkspace \\.camera-ticket[^{]*)\\{([^}]*)\\}`, 'g'))]
      .map(([, selector, body]) => `${selector.trim()} { ${body.replace(/\s+/g, ' ').trim()} }`);
    const studio = fs.readFileSync('src/studio.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const tablet = studio.slice(studio.indexOf('@media (min-width: 761px) and (max-width: 1099px) and (min-height: 960px) and (orientation: portrait)'));
    const tabletRules = rules(tablet.slice(0, tablet.indexOf('#cameraWorkspace .camera-actions {')), '  ');
    const band = css.slice(css.indexOf('@media (min-width: 1100px) and (min-height: 680px) and (max-height: 869px), (min-width: 1100px) and (min-height: 1760px)'));
    const desktopRules = rules(band.slice(0, band.indexOf('\n}\n')), '  body\\[data-desktop\\] ');
    expect(tabletRules.length).toBe(16);
    expect(desktopRules).toEqual(tabletRules);
  });
});

test('인쇄 미리보기 «인쇄하기»는 대화 상자 공통 위 여백(20px)을 쓰지 않는다 — «닫기»와 한 줄(10/27)', () => {
  const css = fs.readFileSync('src/desktop.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  expect(css).toMatch(/\.print-preview-actions \.primary-button\s*\{[^}]*margin-top:\s*0;/);
  expect(css).toMatch(/\.print-preview-actions \.back-button\s*\{[^}]*height:\s*52px;/);
});

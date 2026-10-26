// @vitest-environment jsdom
/* 2026-10-27 — 웹 첫 화면 «↓ 다운로드»(_docs/intents/2026-10-27-download-button-deploy).
   첫 화면(1단계)에만 있고, 메뉴 없이 누르면 바로 받는 링크 하나다. 누르기 전에는 설치 파일을 하나도 받지 않는다(fetch 0건 · 미리 받기 없음).
   주소는 firebase.json 리디렉션(302)이 Cloud Storage 공개 객체로 넘긴다 — 단추 주소와 리디렉션 출발 주소가 어긋나면 404가 나간다.
   실제 브라우저 확인은 scripts/verify/download-button-probe.mjs(dist) · download-live.mjs(라이브). */
import fs from 'node:fs';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import type { StudioMode } from '../src/studioMode.js';
import PosterStudio from '../src/PosterStudio.js';
import { SETUP_DOWNLOAD } from '../src/downloads.js';
import {
  installCanvas, installCamera, installFetch, installImage, installFonts,
  installObjectURL, makeAppContainer
} from './react-setup.js';

let studioMode: StudioMode = 'both';
vi.mock('../src/studioMode.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../src/studioMode.js')>()), get STUDIO_MODE() { return studioMode; } }));

let net: ReturnType<typeof installFetch>;
beforeEach(() => {
  studioMode = 'both';
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  installCanvas();
  installCamera();
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
});

const renderApp = () => render(<PosterStudio />, { container: document.querySelector('main.app') as HTMLElement });
const setupRequests = () => net.calls.filter((u) => /Setup\.exe/i.test(u));
const STORAGE_OBJECT = 'https://storage.googleapis.com/inky-poster-studio-download/PosterStudio-Setup.exe';

describe('웹 첫 화면 «↓ 다운로드»', () => {
  test.each(['both', 'real', 'sample'] as const)('%s: 1단계에만 있고, 메뉴 없이 바로 받는 링크 하나다 — 누르기 전 요청 0건', async (mode) => {
    studioMode = mode;
    await act(async () => { renderApp(); });
    const links = [...document.querySelectorAll<HTMLElement>('.download-link')];
    expect(links).toHaveLength(1);
    const link = links[0];
    expect(link.tagName).toBe('A');
    expect(link.textContent).toBe('다운로드');
    expect(link.getAttribute('href')).toBe(SETUP_DOWNLOAD.href);
    expect(link.getAttribute('download')).toBe('PosterStudio-Setup.exe');
    expect(link.hasAttribute('target')).toBe(false);   // 새 탭 없이 그 자리에서 받는다
    expect(link.hasAttribute('aria-haspopup')).toBe(false);
    // 개인정보처리방침 링크 바로 앞(같은 줄 · 바로 왼쪽 자리)
    expect(link.nextElementSibling?.classList.contains('privacy-link')).toBe(true);
    expect(setupRequests()).toEqual([]);
    // 2단계로 가면 없다
    await act(async () => { (document.getElementById('prepareNextBtn') as HTMLButtonElement).click(); });
    expect(document.body.dataset.step).toBe('2');
    expect(document.querySelector('.download-link')).toBeNull();
    expect(setupRequests()).toEqual([]);
  });
});

describe('설치 파일 주소 연결(firebase.json)', () => {
  const hosting = JSON.parse(fs.readFileSync('firebase.json', 'utf8')).hosting;

  test('단추 주소를 Cloud Storage 공개 객체로 302 리디렉션한다 — 리디렉션은 이것 하나뿐', () => {
    expect(hosting.redirects).toEqual([
      expect.objectContaining({ source: SETUP_DOWNLOAD.href, destination: STORAGE_OBJECT, type: 302 })
    ]);
    // 받는 이름은 객체의 Content-Disposition이 정한다 — 객체 이름과 단추의 download 이름이 같아야 한다
    expect(STORAGE_OBJECT.endsWith('/' + SETUP_DOWNLOAD.file)).toBe(true);
  });

  test('리디렉션보다 먼저 잡히는 것이 없다(dist에 같은 경로의 파일 · 다시 쓰기 규칙 없음)', () => {
    expect(fs.existsSync('public' + SETUP_DOWNLOAD.href)).toBe(false);
    expect(hosting.rewrites).toBeUndefined();
  });

  test('첫 화면 HTML에 설치 파일 미리 받기가 없다', () => {
    expect(fs.readFileSync('index.html', 'utf8')).not.toMatch(/Setup\.exe/i);
  });
});

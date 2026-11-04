// @vitest-environment jsdom
/* 2026-11-05 — 첫 화면 «의견 보내기»(_docs/intents/2026-11-05-field-feedback, Bumm님 9 ① · 11 ②).
   1단계에만 있고 설치판에는 없다. 누르기 전에는 서버 요청 0건. 보내는 본문은 이름 · 의견 · 판 번호 · 화면 크기 · 기기 · 단계 여섯 칸뿐이다
   (사진 · 영화 제목 · 출연진은 싣지 않는다 — 서버도 그 밖의 칸을 거절한다). 이름은 그 기기에 기억한다. */
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import PosterStudio from '../src/PosterStudio.js';
import { API_BASE, BOOTH_TOKEN } from '../src/constants.js';
import {
  installCanvas, installCamera, installFetch, installImage, installFonts,
  installObjectURL, makeAppContainer
} from './react-setup.js';

const flags = vi.hoisted(() => ({ desktop: false, open: true }));
vi.mock('../src/desktop.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/desktop.js')>();
  return { ...real, get DESKTOP() { return flags.desktop; }, desktopBridge: () => null };
});
vi.mock('../src/feedback.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/feedback.js')>();
  return { ...real, get FEEDBACK_OPEN() { return flags.open; } };
});

type Sent = { url: string; init: RequestInit };
let sent: Sent[];
let answer: () => Response;
beforeEach(() => {
  flags.desktop = false;
  flags.open = true;
  sent = [];
  answer = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  localStorage.clear();
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
  const net = installFetch();
  const base = net.fn.getMockImplementation()!;
  net.fn.mockImplementation(async (input: any, init?: any) => {
    if (String(input).endsWith('/feedback')) { sent.push({ url: String(input), init }); return answer(); }
    return base(input, init);
  });
  makeAppContainer();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderApp = () => render(<PosterStudio />, { container: document.querySelector('main.app') as HTMLElement });
const link = () => document.querySelector<HTMLButtonElement>('.feedback-link');
const dialog = () => document.querySelector<HTMLElement>('.feedback-dialog');
const nameBox = () => document.getElementById('feedbackName') as HTMLInputElement;
const textBox = () => document.getElementById('feedbackText') as HTMLTextAreaElement;
const problem = () => document.querySelector('.feedback-problem')?.textContent ?? '';
async function openDialog() {
  await act(async () => { link()!.click(); });
}
async function submit() {
  await act(async () => { fireEvent.submit(dialog()!.querySelector('form')!); });
}

describe('첫 화면 «의견 보내기»', () => {
  test('1단계에 링크 하나 — 개인정보처리방침과 같은 줄(머리글 도구 칸) · 누르기 전 요청 0건', async () => {
    await act(async () => { renderApp(); });
    const links = [...document.querySelectorAll<HTMLElement>('.feedback-link')];
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe('의견 보내기');
    expect(links[0].tagName).toBe('BUTTON');
    expect(links[0].parentElement).toBe(document.querySelector('.privacy-link')!.parentElement);
    expect(dialog()).toBe(null);
    expect(sent).toEqual([]);
  });

  test('설치판에는 없다(서버 요청 0 원칙)', async () => {
    flags.desktop = true;
    await act(async () => { renderApp(); });
    expect(link()).toBe(null);
  });

  test('스위치(FEEDBACK_OPEN)를 끄면 링크가 사라진다', async () => {
    flags.open = false;
    await act(async () => { renderApp(); });
    expect(link()).toBe(null);
  });

  test('창: 시안 문구 · «사진은 보내지 않아요» · 함께 보내는 것 안내 · 이름 칸에서 시작', async () => {
    await act(async () => { renderApp(); });
    await openDialog();
    const d = dialog()!;
    expect(d.getAttribute('role')).toBe('dialog');
    expect(d.querySelector('h2')!.textContent).toBe('의견 보내기');
    expect(d.textContent).toContain('현장에서 불편했던 점 · 바라는 점을 적어 주세요.');
    expect(d.textContent).toContain('사진은 보내지 않아요.');
    expect(d.textContent).toContain('함께 보내는 것: 판 번호 · 화면 크기 · 기기 · 단계');
    expect(d.textContent).toContain('0 / 1000');
    expect(document.activeElement).toBe(nameBox());
  });

  test('보내기: 여섯 칸만 JSON으로 · 부스 토큰 머리글 · 보낸 뒤 «보냈어요» · 이름은 이 기기에 기억', async () => {
    await act(async () => { renderApp(); });
    await openDialog();
    fireEvent.change(nameBox(), { target: { value: '  3번 부스 김진행 ' } });
    fireEvent.change(textBox(), { target: { value: '카메라가 가끔 어두워요.' } });
    expect(dialog()!.textContent).toContain('13 / 1000');
    await submit();
    expect(sent).toHaveLength(1);
    const { url, init } = sent[0];
    expect(url).toBe(`${API_BASE}/feedback`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect((init.headers as Record<string, string>)['x-booth-token']).toBe(BOOTH_TOKEN);
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(['device', 'name', 'screen', 'step', 'text', 'version']);
    expect(body.name).toBe('3번 부스 김진행');
    expect(body.text).toBe('카메라가 가끔 어두워요.');
    expect(body.step).toBe(1);
    expect(body.screen).toMatch(/^\d{2,5}x\d{2,5}@\d{1,2}(\.\d{1,3})?$/);
    expect(body.version).toMatch(/^[A-Za-z0-9._-]{1,80}$/);
    expect(['phone', 'tablet-p', 'tablet-l', 'pc', 'unknown']).toContain(body.device);
    expect(dialog()!.querySelector('h2')!.textContent).toBe('보냈어요');
    expect(localStorage.getItem('posterStudio.feedbackName')).toBe('3번 부스 김진행');
    // 다시 열면 이름이 채워져 있고 의견 칸에서 시작한다
    await act(async () => { (dialog()!.querySelector('button') as HTMLButtonElement).click(); });
    expect(dialog()).toBe(null);
    await openDialog();
    expect(nameBox().value).toBe('3번 부스 김진행');
    expect(textBox().value).toBe('');
    expect(document.activeElement).toBe(textBox());
  });

  test('이름 · 의견이 비면 보내지 않고 알린다', async () => {
    await act(async () => { renderApp(); });
    await openDialog();
    fireEvent.change(textBox(), { target: { value: '의견' } });
    await submit();
    expect(problem()).toBe('이름을 적어 주세요.');
    fireEvent.change(nameBox(), { target: { value: '김진행' } });
    fireEvent.change(textBox(), { target: { value: '   ' } });
    await submit();
    expect(problem()).toBe('의견을 적어 주세요.');
    expect(sent).toEqual([]);
  });

  test('서버가 막거나(429) 실패하면 창을 닫지 않고 글을 그대로 둔 채 알린다', async () => {
    await act(async () => { renderApp(); });
    await openDialog();
    fireEvent.change(nameBox(), { target: { value: '김진행' } });
    fireEvent.change(textBox(), { target: { value: '의견 글' } });
    for (const [status, message] of [[429, '잠시 뒤에 다시 보내 주세요.'], [503, '지금은 보낼 수 없어요. 잠시 뒤에 다시 해 주세요.']] as const) {
      answer = () => new Response('{}', { status });
      await submit();
      expect(problem()).toBe(message);
      expect(dialog()!.querySelector('h2')!.textContent).toBe('의견 보내기');
      expect(textBox().value).toBe('의견 글');
    }
    expect(localStorage.getItem('posterStudio.feedbackName')).toBe(null);
  });

  test('«취소»와 Esc는 보내지 않고 창을 닫는다', async () => {
    await act(async () => { renderApp(); });
    await openDialog();
    await act(async () => { (dialog()!.querySelector('.feedback-cancel') as HTMLButtonElement).click(); });
    expect(dialog()).toBe(null);
    await openDialog();
    await act(async () => { fireEvent.keyDown(dialog()!, { key: 'Escape' }); });
    expect(dialog()).toBe(null);
    expect(sent).toEqual([]);
  });
});

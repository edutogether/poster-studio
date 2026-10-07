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
import { render, act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { TEMPLATES } from '../src/templates.js';
import PosterStudio, { getMeta } from '../src/PosterStudio.js';
import { heightToApply, TWO_COL_MIN_WIDTH } from '../src/useLayoutMatch.js';
import {
  installCanvas, installCamera, installFetch, installImage, installFonts,
  installObjectURL, makeVideoReady, makeAppContainer
} from './react-setup.js';

let canvasContexts: any[];
let cam: ReturnType<typeof installCamera>;
let objectUrls: ReturnType<typeof installObjectURL>;

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  canvasContexts = installCanvas();
  cam = installCamera();
  objectUrls = installObjectURL();
  installImage();
  installFonts();
  installFetch();
  makeAppContainer();
  document.body.classList.remove('app-ready');   // 테스트 간에 새지 않게 한다
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

describe('주연 이름', () => {
  test.each(['', '   ', '김인키', '김태범'])('입력 %j의 성을 생략하지 않고 빈 값만 김인키로 채운다', async (name) => {
    await act(async () => { renderApp(); });
    el<HTMLInputElement>('studentName').value = name;
    expect(getMeta('solo').name).toBe(name.trim() || '김인키');
  });
});

describe('기본 영화 제목', () => {
  test('비어 있거나 공백만 입력하면 첫 화면과 같은 별을 찾는 아이를 사용한다', async () => {
    await act(async () => { renderApp(); });
    expect(getMeta('solo').title).toBe('별을 찾는 아이');
    el<HTMLInputElement>('movieTitle').value = '   ';
    expect(getMeta('group').title).toBe('별을 찾는 아이');
    el<HTMLInputElement>('movieTitle').value = '우리가 만든 영화';
    expect(getMeta('group').title).toBe('우리가 만든 영화');
  });
});

describe('세 단계 화면 연결', () => {
  test.each([true, false])('생성 대기 화면은 요청을 늘리지 않고 응답 뒤 닫힌다(성공=%s)', async (success) => {
    await act(async () => { renderApp(); });
    await shoot();
    const originalFetch = globalThis.fetch;
    let release!: () => void;
    const pendingFetch = vi.fn((...args: Parameters<typeof fetch>) => new Promise<Response>(resolve => {
      release = () => {
        if (success) void originalFetch(...args).then(resolve);
        else resolve(new Response(JSON.stringify({ error: '검사 응답 실패' }), { status: 503 }));
      };
    }));
    vi.stubGlobal('fetch', pendingFetch);
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(el<HTMLDialogElement>('spinner').open).toBe(true);
    expect(el('status').parentElement!.hidden).toBe(true);
    expect(document.querySelector('.generation-pause')).toBeNull();   // 로딩 화면에 멈춤 단추가 없다(결정 118)
    expect(pendingFetch).toHaveBeenCalledTimes(1);
    await act(async () => { release(); });
    expect(document.getElementById('spinner')).toBe(null);
    if (success) expect(el('resultView').hidden).toBe(false);
    else {
      expect(el('status').parentElement!.hidden).toBe(false);
      expect(el('status').textContent).toContain('검사 응답 실패');
      expect(el('fallbackBtn').className).not.toContain('hidden');
    }
  });

  test('촬영 안내 사진은 예시일 뿐 생성에 쓰이지 않으며 카메라를 켜면 숨긴다', async () => {
    const f = installFetch();
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    const example = document.querySelector<HTMLImageElement>('.camera-example')!;
    expect(example.hidden).toBe(false);
    expect(el('snapshot').getAttribute('src')).toBe(null);
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(f.bodies).toHaveLength(0);
    expect(el('status').textContent).toContain('먼저 사진을 촬영');
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(example.hidden).toBe(true);
    expect(el('video').className).not.toContain('hidden');
  });

  test('고른 영화와 단체·구성원은 촬영 티켓까지 이어지고 정보 수정 후에도 갱신된다', async () => {
    const view = await act(async () => renderApp());
    fireEvent.click(view.getByRole('button', { name: '우리 같이' }));
    fireEvent.input(el('movieTitle'), { target: { value: '우리의 별' } });
    fireEvent.input(el('groupName'), { target: { value: '별빛 동아리' } });
    fireEvent.change(el('memberDraft'), { target: { value: '태범,서희 ' } });
    fireEvent.click(view.getByRole('button', { name: '판타지' }));
    fireEvent.click(el('prepareNextBtn'));
    const ticket = document.querySelector('.camera-ticket')!;
    expect(ticket.textContent).toContain('우리의 별');
    expect(ticket.textContent).toContain('별빛 동아리 | 태범 · 서희');
    expect(ticket.textContent).toContain('판타지');
    expect(document.querySelector<HTMLImageElement>('.camera-film-scene img')!.getAttribute('src')).toBe('/studio/reference-fantasy.png');
    fireEvent.click(view.getByRole('button', { name: '이전 단계로' }));
    fireEvent.click(view.getByRole('button', { name: '단독 주연' }));
    fireEvent.input(el('studentName'), { target: { value: '하늘' } });
    fireEvent.click(el('prepareNextBtn'));
    expect(ticket.textContent).toContain('주연 · 하늘');
    expect(ticket.textContent).not.toContain('별빛 동아리');
  });

  test('정보 준비 → 촬영 → 실제 조판 결과 네 장으로 이동한다', async () => {
    const f = installFetch();
    await act(async () => { renderApp(); });
    expect(el('prepareView').hidden).toBe(false);
    expect(el('cameraView').hidden).toBe(true);
    expect(el('resultView').hidden).toBe(true);
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    expect(el('prepareView').hidden).toBe(true);
    expect(el('cameraView').hidden).toBe(false);
    expect(f.bodies).toHaveLength(0);
    await shoot();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(f.bodies).toHaveLength(1);
    expect(el('resultView').hidden).toBe(false);
    expect(document.querySelectorAll('#gallery .thumb')).toHaveLength(8);
    const options = document.querySelectorAll<HTMLButtonElement>('#gallery .thumb');
    await act(async () => { options[2].click(); });
    expect(options[2].getAttribute('aria-pressed')).toBe('true');
    expect(options[0].getAttribute('aria-pressed')).toBe('false');
  });

  test('완료 알림은 2.2초 뒤 닫히고 새 생성 때만 다시 표시한다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(document.querySelector('.completion-notice strong')!.textContent).toBe('완성 !');
    expect(document.querySelector('.completion-notice p')!.textContent).toBe('마음에 드는 버전을 고르고 인쇄하세요.');
    expect(el('status').textContent).toBe('');
    await act(async () => { await vi.advanceTimersByTimeAsync(2200); });
    expect(document.querySelector('.completion-notice')).toBe(null);
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(document.querySelector('.completion-notice')).not.toBe(null);
  });

  test.each(['영화 준비', '사진 촬영'])('완료 알림은 %s 단계로 나가면 즉시 사라지고 돌아와도 재표시하지 않는다', async (destination) => {
    const view = await act(async () => renderApp());
    await shoot();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(document.querySelector('.completion-notice')).not.toBe(null);
    await act(async () => { view.getByRole('button', { name: new RegExp(destination) }).click(); });
    expect(document.querySelector('.completion-notice')).toBe(null);
    await act(async () => { view.getByRole('button', { name: /포스터 선택/ }).click(); });
    expect(document.querySelector('.completion-notice')).toBe(null);
    expect(el('status').textContent).toBe('');
  });

  test('촬영 화면에서 정보 수정으로 돌아가면 카메라를 끈다', async () => {
    const view = await act(async () => renderApp());
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    await act(async () => { view.getByRole('button', { name: '이전 단계로' }).click(); });
    expect(cam.stopped).toEqual(['video']);
    expect(el('prepareView').hidden).toBe(false);
  });

  test('권한 응답을 기다리다 돌아간 경우 늦게 도착한 카메라도 끈다', async () => {
    let resolveCamera!: (stream: MediaStream) => void;
    const stop = vi.fn();
    navigator.mediaDevices.getUserMedia = vi.fn(() => new Promise(resolve => { resolveCamera = resolve; }));
    const view = await act(async () => renderApp());
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); el<HTMLButtonElement>('startBtn').click(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => { view.getByRole('button', { name: '이전 단계로' }).click(); });
    await act(async () => { resolveCamera({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
    expect(stop).toHaveBeenCalledTimes(1);
    expect(el<HTMLVideoElement>('video').srcObject).toBe(null);
    expect(el('prepareView').hidden).toBe(false);
  });

  test('생성이 실패하면 오류를 보이고 기본 버전으로 이어갈 수 있다', async () => {
    await act(async () => { renderApp(); });
    await shoot();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({error:'검사 응답 실패'}), {status:503})));
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(el('status').textContent).toContain('검사 응답 실패');
    expect(el('fallbackBtn').className).not.toContain('hidden');
    await act(async () => { el<HTMLButtonElement>('fallbackBtn').click(); });
    expect(el('resultView').hidden).toBe(false);
    expect(document.querySelectorAll('#gallery .thumb')).toHaveLength(8);
  });

  test('다음 주인공은 이전 사진·입력·결과를 모두 지운다', async () => {
    const view = await act(async () => renderApp());
    await shoot();
    el<HTMLInputElement>('studentName').value = '김인키';
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { view.getByRole('button', { name: '다음 주인공' }).click(); });
    expect(el('prepareView').hidden).toBe(false);
    expect(el<HTMLInputElement>('studentName').value).toBe('');
    expect(el('snapshot').getAttribute('src')).toBe(null);
    expect(document.querySelectorAll('#gallery .thumb')).toHaveLength(0);
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(el('status').textContent).toContain('먼저 사진을 촬영');
  });

  test('구분자로 묶은 출연진과 아직 묶지 않은 이름을 함께 조판하고 삭제한다', async () => {
    const view = await act(async () => renderApp());
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-mode=group]')!.click(); });
    fireEvent.change(el('memberDraft'), { target: { value: '김인키,이영화.박감독·최소리/윤별|하늘 ' } });
    expect(document.querySelectorAll('.member-chip')).toHaveLength(6);
    expect(el<HTMLInputElement>('members').value).toBe('김인키, 이영화, 박감독, 최소리, 윤별, 하늘');
    fireEvent.change(el('memberDraft'), { target: { value: '새이름' } });
    expect(el<HTMLInputElement>('members').value).toContain('새이름');
    fireEvent.click(view.getByRole('button', { name: '박감독 삭제' }));
    expect(el<HTMLInputElement>('members').value).not.toContain('박감독');
    expect(el('ticketName').textContent).toContain('새이름');
    await shoot();
    const f = installFetch();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect([...f.bodies[0].keys()].sort()).toEqual(['genre','mode','movieTitle','photo','tagline']);
    expect(JSON.stringify([...f.bodies[0].entries()])).not.toContain('새이름');
  });

  test('한글 조합 중에는 태그로 자르지 않고 조합이 끝난 뒤 구분한다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { document.querySelector<HTMLButtonElement>('[data-mode=group]')!.click(); });
    fireEvent.compositionStart(el('memberDraft'));
    fireEvent.change(el('memberDraft'), { target: { value: '김인키 ' } });
    expect(document.querySelectorAll('.member-chip')).toHaveLength(0);
    fireEvent.compositionEnd(el('memberDraft'));
    expect(document.querySelectorAll('.member-chip')).toHaveLength(1);
    fireEvent.blur(el('memberDraft'));
    expect(el<HTMLInputElement>('members').value).toBe('김인키');
  });
});

/* ───────────────────── 카메라 (예전 camera.test.js) ───────────────────── */
describe('카메라', () => {
  test('카메라 켜기: 스트림을 연결하고 안내 문구를 바꾼다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(document.querySelector('.camera-ready-notice')!.textContent).toContain('카메라 준비 완료');
    expect(el('status').textContent).toBe('');
  });

  test('카메라 끄기는 스트림을 해제하고 켜짐 표시와 준비 알림을 지운다', async () => {
    const view = await act(async () => renderApp());
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(document.querySelector('.camera-live-indicator')).not.toBe(null);
    expect(document.querySelector('.camera-ready-notice')).not.toBe(null);
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(document.querySelector('.camera-ready-notice')).toBe(null);
    await act(async () => { el<HTMLButtonElement>('stopCameraBtn').click(); });
    expect(cam.stopped).toEqual(['video']);
    expect(el<HTMLVideoElement>('video').srcObject).toBe(null);
    expect(document.querySelector('.camera-live-indicator')).toBe(null);
    expect(document.querySelector<HTMLImageElement>('.camera-example')!.hidden).toBe(false);
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    expect(document.querySelector('.camera-ready-notice')).not.toBe(null);
    await act(async () => { view.getByRole('button', { name: '이전 단계로' }).click(); });
    expect(document.querySelector('.camera-ready-notice')).toBe(null);
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    expect(document.querySelector('.camera-ready-notice')).toBe(null);
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
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await shoot();
    expect(el('status').textContent).toBe('');
    expect(document.querySelector('.camera-capture-notice')!.textContent).toContain('촬영 완료 !');
    expect(el('snapshot').className).not.toContain('hidden');
    expect(el<HTMLImageElement>('snapshot').getAttribute('src')).toBe(objectUrls.created[0]);
    expect(el('video').className).toContain('hidden');
  });

  test('촬영: 카메라가 꺼져 있으면 먼저 켠 뒤 이어서 촬영한다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    makeVideoReady(el<HTMLVideoElement>('video'));
    await runCountdown();
    vi.useRealTimers();
    await act(async () => { await Promise.resolve(); });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
    expect(el('status').textContent).toBe('');
    expect(document.querySelector('.camera-capture-notice')!.textContent).toContain('촬영 완료 !');
  });

  test.each(['시간 경과', '단계 이동'])('촬영 완료 알림은 %s 후 사라지고 돌아와도 반복되지 않는다', async (reason) => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await act(async () => { el<HTMLButtonElement>('startBtn').click(); });
    makeVideoReady(el<HTMLVideoElement>('video'));
    vi.useFakeTimers();
    await act(async () => { el<HTMLButtonElement>('shotBtn').click(); });
    await runCountdown();
    expect(document.querySelector('.camera-capture-notice')).not.toBeNull();
    if (reason === '시간 경과') {
      await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
    } else {
      await act(async () => { document.querySelector<HTMLButtonElement>('#cameraWorkspace .back-button')!.click(); });
    }
    expect(document.querySelector('.camera-capture-notice')).toBeNull();
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    expect(document.querySelector('.camera-capture-notice')).toBeNull();
  });

  test('다시 촬영: 미리보기가 사라지고 카메라가 다시 켜진다', async () => {
    await act(async () => { renderApp(); });
    await act(async () => { el<HTMLButtonElement>('prepareNextBtn').click(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('retakeBtn').click(); });
    expect(el('video').className).not.toContain('hidden');
    expect(el('snapshot').className).toContain('hidden');
    expect(document.querySelector('.camera-ready-notice')!.textContent).toContain('카메라 준비 완료');
    expect(el('status').textContent).toBe('');
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
    await act(async () => { renderApp(true); });
    /* '그렸다'의 증거는 실제 그리기 호출이다. 효과가 두 번 돌면 캔버스 컨텍스트를
       두 번 집어 각각에 그리므로, fillText가 일어난 컨텍스트가 둘이 된다.
       (4단계 전에는 스플래시 내림 호출 횟수로 셌는데, 그 다리는 표준 적용으로
       없어졌다 — 신호를 바꾸고 변형 검증을 다시 돌렸다.) */
    const drawn = canvasContexts.filter((c) => c.__fillTextCalls > 0);
    expect(drawn.length).toBe(1);
  });

  test('첫 화면을 그리고 나면 body에 app-ready를 붙인다(스플래시 로드 게이트)', async () => {
    expect(document.body.classList.contains('app-ready')).toBe(false);
    await act(async () => { renderApp(); });
    // 이게 빠지면 스플래시가 멈춘 채로 안전판(8초)까지 남는다.
    expect(document.body.classList.contains('app-ready')).toBe(true);
  });
});

/* ───────── 위험 F — 관찰은 왼쪽, 변경은 오른쪽 ───────── */
describe('위험 F: ResizeObserver 방향', () => {
  test('단계별 화면은 높이 동기화 관찰자를 만들지 않아 크기 변경 루프가 없다', async () => {
    const observed: Element[] = [];
    class RO {
      constructor(_cb: ResizeObserverCallback) {}
      observe(t: Element) { observed.push(t); }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO);
    await act(async () => { renderApp(); });
    // 확정된 단계별 디자인은 CSS로 높이를 정한다. 기존 한 화면 3패널의
    // 높이 복사 관찰자를 제거했으므로 생성 수 0이 회귀 방지 기준이다.
    expect(observed.length).toBe(0);
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

  test('결과 화면에는 8개 디자인과 인쇄만 제공하고 저장·재생성·더 보기는 없다', async () => {
    await act(async () => { renderApp(); });
    await shoot(); await generate();
    expect(document.querySelectorAll('#gallery .thumb')).toHaveLength(8);
    for (const id of ['downloadBtn', 'regenBtn', 'resetBtn']) expect(document.getElementById(id)).toBe(null);
    expect(document.querySelector('#resultView details')).toBe(null);
    expect(el<HTMLButtonElement>('printBtn').disabled).toBe(false);
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

  test('다시 촬영한 사진은 두 번 한도를 소진한 이전 사진과 별도로 생성할 수 있다', async () => {
    const { calls } = installFetch();
    await act(async () => { renderApp(); });
    await shoot(); await generate(); await generate(); await generate();
    expect(calls.filter(u => u.includes('/generate'))).toHaveLength(2);
    await act(async () => { el<HTMLButtonElement>('retakeBtn').click(); });
    await shoot(); await generate();
    expect(calls.filter(u => u.includes('/generate'))).toHaveLength(3);
  });

  test('8개 디자인 선택은 추가 생성 요청을 보내지 않는다', async () => {
    const { calls } = installFetch();
    await act(async () => { renderApp(); });
    await shoot(); await generate();
    for (const option of document.querySelectorAll<HTMLButtonElement>('#gallery .thumb')) {
      await act(async () => { option.click(); });
    }
    expect(calls.filter(u => u.includes('/generate'))).toHaveLength(1);
  });
});

/* ───────────────── 저장·인쇄 (예전 print.test.js) ───────────────── */
/* 다음 주인공은 기존 촬영 사진과 입력값을 함께 정리한다. */
describe('다음 주인공', () => {
  /** 촬영까지 끝내고 입력을 다 채운 뒤 포스터까지 만들어 둔다. */
  async function 채워놓기() {
    await act(async () => { renderApp(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('modeSeg').querySelector<HTMLButtonElement>('[data-mode="group"]')!.click(); });
    el<HTMLInputElement>('groupName').value = '햇살초 5학년 2반';
    el<HTMLInputElement>('members').value = '김인키, 이영화';
    el<HTMLInputElement>('movieTitle').value = '사라진 급식의 비밀';
    el<HTMLSelectElement>('genre').value = 'mystery';
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { await Promise.resolve(); });
  }

  test('입력·장르·개인단체·포스터를 지운다', async () => {
    await 채워놓기();
    expect(document.querySelectorAll('.gallery .thumb').length).toBeGreaterThan(0);
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="다음 주인공"]')!.click(); });
    for (const id of ['studentName', 'groupName', 'members', 'movieTitle']) {
      expect(el<HTMLInputElement>(id).value).toBe('');
    }
    expect(el<HTMLSelectElement>('genre').selectedIndex).toBe(0);
    expect(document.querySelectorAll('.gallery .thumb').length).toBe(0);
    expect(el('modeSeg').querySelector('[data-mode="solo"]')!.className).toContain('active');
    expect(el('status').textContent).toBe('');
  });

  test('다음 주인공은 이전 사진과 포스터를 제거하고 영화 준비 화면으로 돌아간다', async () => {
    await 채워놓기();
    expect(el<HTMLImageElement>('snapshot').getAttribute('src')).toBeTruthy();
    await act(async () => { document.querySelector<HTMLButtonElement>('[aria-label="다음 주인공"]')!.click(); });
    expect(el<HTMLImageElement>('snapshot').getAttribute('src')).toBeFalsy();
    expect(el('prepareView').hidden).toBe(false);
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    expect(el('status').textContent).toContain('먼저 사진을 촬영');
  });
});

/* ───────────────── 🔴 개인정보 — 화면 고지가 한 약속 ─────────────────
   `privacy.html`이 아이와 교사에게 **"이름·단체명·출연진은 전송되지 않습니다"**라고
   약속하고 있고, `app.md`도 "이 설계를 깨지 말 것"이라고 못박아 뒀다.

   그런데 2026-09-10 감사 시점까지 **그 약속을 지키는 테스트가 하나도 없었다.**
   누가 `form.append('studentName', ...)` 한 줄을 넣어도 테스트·린트·타입검사·CI가
   전부 초록불이고, 화면 고지만 거짓이 된다. 아동 개인정보라 되돌릴 수도 없다.

   그래서 **보내는 것**과 **절대 안 보내는 것**을 양쪽으로 고정한다. */
describe('개인정보: 서버로 보내는 것', () => {
  async function 생성해서_보낸_본문() {
    const f = installFetch();
    await act(async () => { renderApp(); });
    await shoot();
    el<HTMLInputElement>('studentName').value = '김인키';
    el<HTMLInputElement>('movieTitle').value = '우주를 달리는 인키';
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { await Promise.resolve(); });
    expect(f.bodies.length, '/generate 요청이 실제로 나가야 이 테스트가 의미가 있다').toBeGreaterThan(0);
    return f.bodies[0];
  }

  test('🔴 이름·단체명·출연진은 서버로 보내지 않는다(화면 고지가 한 약속)', async () => {
    const body = await 생성해서_보낸_본문();
    const keys = [...body.keys()];
    for (const 금지 of ['studentName', 'groupName', 'members', 'name', 'title']) {
      expect(keys, `${금지}는 서버로 나가면 안 된다 — privacy.html의 약속이다`).not.toContain(금지);
    }
    expect(JSON.stringify([...body.entries()].filter(([k]) => k !== 'photo')))
      .not.toContain('김인키');
  });

  test('보내는 필드는 사진·영화제목·홍보문구·장르·모드 다섯뿐이다', async () => {
    const body = await 생성해서_보낸_본문();
    expect([...body.keys()].sort())
      .toEqual(['genre', 'mode', 'movieTitle', 'photo', 'tagline']);
  });
});

describe('부스 코드(서버 스위치 기본 꺼짐)', () => {
  async function 생성_요청_헤더() {
    const f = installFetch();
    await act(async () => { renderApp(); });
    await shoot();
    await act(async () => { el<HTMLButtonElement>('generateBtn').click(); });
    await act(async () => { await Promise.resolve(); });
    const call = f.fn.mock.calls.find(([url]) => String(url).includes('/generate'));
    expect(call, '/generate 요청이 실제로 나가야 이 테스트가 의미가 있다').toBeTruthy();
    return call![1].headers as Record<string, string>;
  }

  test('보관된 코드가 없으면 생성 요청 헤더는 예전과 같다', async () => {
    localStorage.removeItem('poster-studio-booth-code');
    expect(Object.keys(await 생성_요청_헤더())).toEqual(['x-booth-token']);
  });

  test('보관된 코드가 있으면 생성 요청에 x-booth-code로 싣는다', async () => {
    localStorage.setItem('poster-studio-booth-code', 'TEST-CODE-1234');
    try {
      expect((await 생성_요청_헤더())['x-booth-code']).toBe('TEST-CODE-1234');
    } finally {
      localStorage.removeItem('poster-studio-booth-code');
    }
  });
});

describe('인쇄', () => {
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


describe('로컬 포스터 디자인 작업',()=>{
  test('촬영 없이 샘플 한 장으로 8개 틀을 열고 외부 요청을 보내지 않는다',async()=>{
    vi.stubEnv('DEV',true);vi.stubEnv('VITE_POSTER_DESIGN_PREVIEW','1');
    const f=installFetch();
    await act(async()=>{renderApp();});
    await act(async()=>{el<HTMLButtonElement>('prepareNextBtn').click();});
    expect(el('shotBtn').textContent).toContain('샘플 포스터 보기');
    await act(async()=>{el<HTMLButtonElement>('shotBtn').click();});
    await waitFor(()=>expect(document.body.dataset.step).toBe('3'));
    expect(document.querySelectorAll('.style-option')).toHaveLength(TEMPLATES.length);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(f.calls).toHaveLength(0);
    expect(document.getElementById('spinner')).toBeNull();
  });
  test('배포 환경에서는 디자인 설정이 있어도 촬영 버튼을 유지한다',async()=>{
    vi.stubEnv('DEV',false);vi.stubEnv('VITE_POSTER_DESIGN_PREVIEW','1');
    await act(async()=>{renderApp();});
    expect(el('shotBtn').textContent).not.toContain('샘플 포스터 보기');
    expect(el('shotBtn').textContent).toBe('3초 뒤 사진 찍기');
  });
});

// @vitest-environment jsdom
/* 헤더 «처음으로»와 부스 코드 «취소»가 사진 · 카메라 · 입력을 남김없이 버리는 유일한 길(2026-10-17 종합감사).
   다른 시험(poster-studio.test.tsx)은 이 모듈을 가짜로 바꿔 끼우므로, 진짜 구현은 여기서만 본다. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { finishHomeRestart, restartAtHome } from '../src/restartHome.js';

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
});

describe('restartAtHome', () => {
  test('같은 주소의 첫 화면을 새 문서로 연다 — 경로 · 쿼리 · #booth= 같은 조각은 버리고 매번 다른 표지를 붙인다', () => {
    history.replaceState(null, '', '/some/page?preview=posters#booth=abc');
    const go = vi.fn();
    restartAtHome(go);
    restartAtHome(go);
    const [first, second] = go.mock.calls.map(([href]) => new URL(href as string));
    expect(first.origin).toBe(location.origin);
    expect(first.pathname).toBe('/');
    expect([...first.searchParams.keys()]).toEqual(['studio-start']);
    expect(first.hash).toBe('');
    expect(first.searchParams.get('studio-start')).not.toBe(second.searchParams.get('studio-start'));
  });

  test('로딩 화면 첫 장면 기록만 지우고 다른 저장값은 남긴다', () => {
    sessionStorage.setItem('poster-studio-wait-opening', '3');
    sessionStorage.setItem('other-app', 'keep');
    restartAtHome(vi.fn());
    expect(sessionStorage.getItem('poster-studio-wait-opening')).toBeNull();
    expect(sessionStorage.getItem('other-app')).toBe('keep');
  });

  test('저장소가 막힌 브라우저에서도 처음 화면으로 간다', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('저장소 차단'); });
    const go = vi.fn();
    restartAtHome(go);
    expect(go).toHaveBeenCalledTimes(1);
  });
});

describe('finishHomeRestart', () => {
  test('새로 연 문서의 주소에서 표지만 지우고 나머지(쿼리 · 조각)는 둔다', () => {
    history.replaceState(null, '', '/?studio-start=abc&x=1#booth=code');
    finishHomeRestart();
    expect(location.pathname + location.search + location.hash).toBe('/?x=1#booth=code');
  });

  test('표지가 없으면 주소를 건드리지 않는다', () => {
    history.replaceState(null, '', '/?x=1');
    const replace = vi.spyOn(history, 'replaceState');
    finishHomeRestart();
    expect(replace).not.toHaveBeenCalled();
    expect(location.search).toBe('?x=1');
  });
});

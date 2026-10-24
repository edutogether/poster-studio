// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRef } from "react";
import type { SceneEnd } from "../src/studio/GenerationWait.js";
import { act, cleanup, render } from "@testing-library/react";
import GenerationWait, { createWaitSequence } from "../src/studio/GenerationWait.js";
import { waitingSets } from "../src/studio/waitingSets.js";
import fs from "node:fs";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});   // jsdom에는 load()가 없다
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const headline = () => document.querySelector('#generationTitle [data-active="true"]')!.textContent;
const fact = () => document.querySelector('.movie-fact h2[data-active="true"]')!.textContent;
const activeImage = () => document.querySelector<HTMLImageElement>('.generation-robot-film[data-active="true"]')!;
describe("포스터 생성 대기", () => {
  test("확정 자료의 문구와 실제 앱 12세트가 일치한다",()=>{
    // 그림은 2026-10-12부터 대기 영상 첫 프레임이다 — test/waiting-video-assets.test.js가 목록의 해시로 확인한다.
    const approved=JSON.parse(fs.readFileSync('_docs/intents/2026-09-30-studio-design-integration/loading-approved-2026-10-01/assets/sets.json','utf8'));
    for(const scene of waitingSets){
      const saved=approved.find((s:{id:number})=>s.id===scene.id);
      // 설명의 \n은 휴대폰에서 줄을 바꾸는 자리일 뿐 문구는 확정본 그대로다(10/20). 빨간 글씨(fact.title) 끝 온점은 10/24 Bumm님 지시로 뺐다 —
      // 확정 자료는 기록이라 그대로 두고 여기서 온점만 떼어 견준다.
      expect(scene.title).toBe(saved.title);
      expect({ ...scene.fact, body: scene.fact.body.replace(/\n/g, " ") }).toEqual({ ...saved.fact, title: saved.fact.title.replace(/\.$/, "") });
      expect(scene.fact.title.endsWith("."), `${scene.id}번 빨간 글씨 끝 온점`).toBe(false);
    }
  });
  test("휴대폰 줄 바꿈은 10/20 Bumm님이 고른 자리 한 곳뿐이다(1 · 3 · 6번은 한 줄)",()=>{
    const after: Record<number, string> = { 2: "그려", 4: "장편", 5: "작업을", 7: "선율을", 8: "언어의", 9: "포효에는", 10: "배우고", 11: "관찰하며", 12: "그린" };
    for (const { id, fact: { body } } of waitingSets) {
      const lines = body.split("\n");
      if (after[id]) { expect(lines, `${id}번`).toHaveLength(2); expect(lines[0].endsWith(after[id]), `${id}번`).toBe(true); }
      else expect(lines, `${id}번`).toHaveLength(1);
    }
  });
  test("생성이 끝났을 때 재생 중인 대기 영상은 끝까지 기다리고, 재생 중이 아니면 바로 넘어간다(10/20, PC도)",async()=>{
    const sceneEndRef: { current: SceneEnd | null } = { current: null };
    render(<GenerationWait spinTextRef={createRef()} sceneEndRef={sceneEndRef}/>);
    let done = false;
    await act(async()=>{ await sceneEndRef.current!().then(()=>{ done = true; }); });
    expect(done).toBe(true);   // 정지 그림(영상이 아직 안 나옴)이면 기다리지 않는다
    const v = document.querySelector<HTMLVideoElement>(".generation-robot-video")!;
    act(()=>{ v.dispatchEvent(new Event("playing")); });
    expect(v.dataset.active).toBe("true");
    await act(async()=>{ await vi.advanceTimersByTimeAsync(6_500); });   // 장면 경계(8초) 1.5초 전
    Object.defineProperty(v, "paused", { configurable: true, get: () => false });
    Object.defineProperty(v, "duration", { configurable: true, get: () => 8 });
    Object.defineProperty(v, "currentTime", { configurable: true, get: () => 5 });   // 늦게 시작해 3초 남았다
    const scene = headline();
    done = false;
    const wait = sceneEndRef.current!().then(()=>{ done = true; });
    await act(async()=>{ await vi.advanceTimersByTimeAsync(2_000); });
    expect(done).toBe(false);
    expect(headline()).toBe(scene);   // 기다리는 동안 장면 경계를 지나도 넘기지 않는다(영상이 잘리지 않게)
    await act(async()=>{ v.dispatchEvent(new Event("ended")); await wait; });
    expect(done).toBe(true);
    done = false;
    const capped = sceneEndRef.current!().then(()=>{ done = true; });
    await act(async()=>{ await vi.advanceTimersByTimeAsync(3_300); await capped; });   // «ended»가 안 와도 남은 시간 + 0.3초면 넘어간다
    expect(done).toBe(true);
  });
  test("같은 난수에서도 세션에 저장한 첫 세트를 다시 선택하지 않는다",()=>{
    vi.spyOn(crypto,'getRandomValues').mockImplementation(array => { (array as Uint32Array).fill(0); return array; });
    const previous=createWaitSequence()[0].id;
    sessionStorage.setItem('poster-studio-wait-opening',String(previous));
    expect(createWaitSequence()[0].id).not.toBe(previous);
  });

  test("12개 상식을 중복 없이 섞고 직전 시작 문구와 상식을 반복하지 않는다", () => {
    const random = vi.spyOn(Math,"random");
    const a=createWaitSequence(), b=createWaitSequence();
    expect(a).toHaveLength(12);
    expect(new Set(a.map(s=>s.id)).size).toBe(waitingSets.length);
    expect(new Set(a.map(s=>s.title)).size).toBe(12);
    expect(new Set(a.map(s=>s.image)).size).toBe(12);
    for(const scene of a) expect(scene).toEqual(waitingSets.find(s=>s.id===scene.id));
    expect(b[0].id).not.toBe(a[0].id);
    expect(b[0].title).not.toBe(a[0].title);
    expect(random).not.toHaveBeenCalled();
  });
  test("8초마다 원화·문구는 바뀌지만 점의 DOM과 애니메이션은 유지한다", () => {
    render(<GenerationWait spinTextRef={createRef()}/>);
    const firstTitle=headline(),firstFact=fact(),firstImage=activeImage().getAttribute("src");
    const dots=document.querySelector('.generation-dots')!;
    const dot=dots.firstElementChild;
    expect(dots.children.length).toBe(3);
    expect(dots.previousElementSibling?.id).toBe('generationTitle');
    expect(dots.nextElementSibling?.className).toBe('movie-fact');
    expect(firstImage).toContain('/studio/waiting-v2/');
    const seen=new Set<number>();
    for(let i=0;i<12;i++){
      const id=Number(document.getElementById('spinner')?.dataset.setId);
      seen.add(id); const expected=waitingSets.find(s=>s.id===id)!;
      expect(headline()).toBe(expected.title); expect(fact()).toBe(expected.fact.title);
      expect(activeImage().getAttribute('src')).toBe(expected.image);
      act(()=>vi.advanceTimersByTime(8_000));
    }
    expect(seen.size).toBe(12);
    act(()=>vi.advanceTimersByTime(8_000));
    expect(headline()).not.toBe(firstTitle);expect(fact()).not.toBe(firstFact);
    expect(activeImage().getAttribute("src")).not.toBe(firstImage);
    expect(document.querySelector('.generation-dots')).toBe(dots);
    expect(dots.firstElementChild).toBe(dot);
  });
  test("로딩 화면은 멈춤 단추 없이 계속 넘어가고 종료 시 타이머를 정리한다", () => {
    // 2026-10-06 Bumm님 결정 118: 로딩 화면은 멈추는 화면이 아니다 — 자동 넘김 일시 정지 단추를 두지 않는다
    const previousOverflow=document.documentElement.style.overflow;
    const view=render(<GenerationWait spinTextRef={createRef()}/>);
    expect(view.queryByRole('button')).toBeNull();
    expect(document.querySelector('.generation-pause')).toBeNull();
    const first=headline();
    expect(document.getElementById('spinner')?.dataset.paused).toBe('false');
    act(()=>vi.advanceTimersByTime(8_000));expect(headline()).not.toBe(first);
    view.unmount();expect(document.documentElement.style.overflow).toBe(previousOverflow);
    expect(vi.getTimerCount()).toBe(0);
  });
  test("60초가 지나도 지연 안내를 표시하지 않는다",()=>{
    const view=render(<GenerationWait spinTextRef={createRef()}/>);
    act(()=>vi.advanceTimersByTime(60_000));
    expect(view.queryByText(/조금 더 시간이 걸리고/)).toBeNull();
    expect(document.querySelector('.generation-note')).toBeNull();
    expect(document.querySelector('progress')).toBe(null);
  });
  test("움직임 줄이기에서는 선택된 장면의 정지 이미지를 유지한다",()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    render(<GenerationWait spinTextRef={createRef()}/>);const first=headline();
    act(()=>vi.advanceTimersByTime(24_000));expect(headline()).toBe(first);
    expect(activeImage().src).toContain('/studio/waiting-v2/');
    expect(document.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});

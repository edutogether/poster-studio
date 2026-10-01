// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRef } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import GenerationWait, { createWaitSequence } from "../src/studio/GenerationWait.js";
import { waitingSets } from "../src/studio/waitingSets.js";
import fs from "node:fs";
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const headline = () => document.querySelector('#generationTitle [data-active="true"]')!.textContent;
const fact = () => document.querySelector('.movie-fact h2[data-active="true"]')!.textContent;
const activeImage = () => document.querySelector<HTMLImageElement>('.generation-robot-film[data-active="true"]')!;
describe("포스터 생성 대기", () => {
  test("확정 자료의 문구·원화와 실제 앱 12세트가 일치한다",()=>{
    const approved=JSON.parse(fs.readFileSync('_docs/intents/2026-09-30-studio-design-integration/loading-approved-2026-10-01/assets/sets.json','utf8'));
    for(const scene of waitingSets){
      const saved=approved.find((s:{id:number})=>s.id===scene.id);
      expect(scene.title).toBe(saved.title); expect(scene.fact).toEqual(saved.fact);
      expect(fs.readFileSync('public'+scene.image)).toEqual(fs.readFileSync('_docs/intents/2026-09-30-studio-design-integration/loading-approved-2026-10-01/assets/'+String(scene.id).padStart(2,'0')+'.webp'));
    }
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
    expect(firstImage).toContain('/studio/waiting-approved-v1/');
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
  test("일시 정지는 넘김·점·문구를 멈추고 종료 시 타이머를 정리한다", () => {
    const previousOverflow=document.documentElement.style.overflow;
    const view=render(<GenerationWait spinTextRef={createRef()}/>);
    const first=headline();const firstFact=fact();
    fireEvent.click(view.getByRole('button',{name:'자동 넘김 일시 정지'}));
    act(()=>vi.advanceTimersByTime(24_000));
    expect(headline()).toBe(first);expect(fact()).toBe(firstFact);
    expect(document.getElementById('spinner')?.dataset.paused).toBe('true');
    fireEvent.click(view.getByRole('button',{name:'자동 넘김 재생'}));
    act(()=>vi.advanceTimersByTime(8_000));expect(headline()).not.toBe(first);
    view.unmount();expect(document.documentElement.style.overflow).toBe(previousOverflow);
    expect(vi.getTimerCount()).toBe(0);
  });
  test("60초 지연 안내는 완료나 진행률을 가장하지 않는다",()=>{
    const view=render(<GenerationWait spinTextRef={createRef()}/>);
    act(()=>vi.advanceTimersByTime(60_000));
    expect(view.getByText('조금 더 시간이 걸리고 있어요. 완성되면 바로 보여드릴게요.')).toBeTruthy();
    expect(document.querySelector('progress')).toBe(null);
  });
  test("움직임 줄이기에서는 선택된 장면의 정지 이미지를 유지한다",()=>{
    vi.stubGlobal('matchMedia',()=>({matches:true}));
    render(<GenerationWait spinTextRef={createRef()}/>);const first=headline();
    act(()=>vi.advanceTimersByTime(24_000));expect(headline()).toBe(first);
    expect(activeImage().src).toContain('/studio/waiting-approved-v1/');
    expect(document.querySelector('video')).toBeNull();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});

#!/usr/bin/env node
/* 화면 편집판 점검(2026-10-23) — 편집판을 창 없는 크롬으로 열어 4갈래 × 10화면을 모두 열어 보고, 편집 동작을 실제 마우스로 해 본다.

     node scripts/editor/check.mjs [편집판 주소] [결과 폴더] [갈래...] [--window=800x900]     기본 주소 http://127.0.0.1:5390/__editor/ (편집판 서버가 떠 있어야 한다), 갈래를 적으면 그 갈래만(pc · tablet-l · tablet-p · phone)

   본다: ① 화면마다 «가지 못했습니다» 없이 도착하는가 ② 앱 창 크기가 그 갈래의 기준 크기와 같은가(스크롤 막대가 폭을 먹지 않는가)
   ③ 편집판 밖(127.0.0.1 말고)으로 나간 요청이 0건인가 — AI 생성 · 서버 호출이 없어야 한다
   ④ PC 첫 페이지에서 끌어 옮기기 · 모서리 크기 · 글자 + · 숨기기 · 되돌리기 · 다시 열면 남아 있기 · 내보내기 파일 내용.
   화면마다 편집판 화면을 «갈래-화면.png»로 남긴다. 하나라도 어긋나면 종료코드 1. 브라우저 저장소는 임시 프로필이라 사람이 쓰는 편집판의 바꾼 목록은 건드리지 않는다. */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const winOpt = (process.argv.find((a) => a.startsWith('--window=')) || '--window=1700x1100').slice(9).split('x').map(Number);   // 편집판 창 크기(--window=800x900)
const [urlArg, outArg] = argv;
const url = urlArg || 'http://127.0.0.1:5390/__editor/';
const origin = new URL(url).origin;
const out = path.resolve(outArg || path.join(os.tmpdir(), 'ps-editor-check'));
await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const CLASSES = { pc: [2560, 1440], 'tablet-l': [1366, 1024], 'tablet-p': [1024, 1366], phone: [390, 844] };
const SCREENS = ['splash', 'first', 'step1', 'pre-solo', 'pre-group', 'live', 'shot', 'loading', 'result', 'save'];

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-editor-check-'));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', `--window-size=${winOpt[0]},${winOpt[1]}`,
  '--autoplay-policy=no-user-gesture-required', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const fails = [];
const fail = (what) => { fails.push(what); console.log('❌ ' + what); };
try {
  // 조종 포트는 크롬이 빈 것을 골라 프로필 폴더의 DevToolsActivePort에 적는다 — 고정 포트(9690)였을 때 점검 둘이 동시에 돌자
  // 뒤의 점검이 앞 점검의 브라우저를 조종해 둘 다 엉뚱한 결과를 냈다(10/23)
  let target, port;
  for (let i = 0; i < 100 && !target; i++) {
    try { port ??= Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split(/\r?\n/)[0]) || undefined; if (port) target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ }
    if (!target) await delay(100);
  }
  if (!target) throw new Error('크롬에 붙지 못했다');
  const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0; const pending = new Map(); const outside = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Network.requestWillBeSent') { const u = m.params.request.url; if (!u.startsWith(origin + '/') && !/^(data|blob):/.test(u)) outside.push(u); }
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 300)); return m.result?.result?.value; };
  const idle = async (ms = 120000) => { await delay(400); for (let i = 0; i < ms / 250; i++) { if (await evaluate("!document.getElementById('cls').disabled")) return; await delay(250); } throw new Error('여는 중에서 멈춤'); };
  const shot = async (file) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, file), Buffer.from(s.result.data, 'base64')); };
  await call('Network.enable');
  await call('Page.enable');
  await call('Page.navigate', { url });
  await delay(1500); await idle();

  // ① ② 4갈래 × 10화면 — 사람처럼 고르기 칸을 바꾼다(갈래를 바꿀 때는 먼저 가벼운 시작 화면으로 옮겨 긴 흐름을 두 번 타지 않는다)
  const pick = async (id, value) => { await evaluate(`(() => { const el = document.getElementById('${id}'); el.value = ${JSON.stringify(value)}; el.onchange(); return true; })()`); await idle(); };
  const only = argv.slice(2);   // 셋째 인자부터: 이 갈래만(예: phone). none이면 40화면을 건너뛰고 편집 동작만
  for (const [cls, [w, h]] of Object.entries(CLASSES)) {
    if (only.length && !only.includes(cls)) continue;
    await pick('screen', 'splash'); await pick('cls', cls);
    for (const screen of SCREENS) {
      await pick('screen', screen);
      const r = await evaluate(`(() => { const w = document.getElementById('app').contentWindow, o = (id, v) => document.querySelector('#' + id + ' option[value="' + v + '"]').textContent;
        return { status: document.getElementById('status').textContent, want: o('cls', ${JSON.stringify(cls)}) + ' · ' + o('screen', ${JSON.stringify(screen)}), w: w.innerWidth, h: w.innerHeight, cw: w.document.documentElement.clientWidth }; })()`);
      const tag = `${cls} · ${screen}`;
      // 상태 줄이 «그 갈래 · 그 화면»으로 시작해야 그 화면을 연 것이다 — 이것을 안 보면 고르기가 안 먹어도 통과한다(처음 판이 그랬다: 40번 모두 첫 페이지)
      if (!r.status.startsWith(r.want)) fail(`${tag}: 다른 화면이 열림 — 상태 «${r.status.slice(0, 40)}»`);
      if (/가지 못했습니다/.test(r.status)) fail(`${tag}: ${r.status}`);
      if (r.w !== w || r.h !== h) fail(`${tag}: 앱 창 ${r.w}×${r.h}(기준 ${w}×${h})`);
      if (cls !== 'pc' && r.cw !== w) fail(`${tag}: 스크롤 막대가 폭을 먹음 — 내용 폭 ${r.cw}(기준 ${w})`);
      await shot(`${cls}-${screen}.png`);
      console.log(`${tag}: ${/가지 못했습니다/.test(r.status) ? '막힘' : '도착'} · 창 ${r.w}×${r.h} · 내용 폭 ${r.cw}${/⚠/.test(r.status) ? ' · ' + r.status.split('⚠')[1].trim().slice(0, 50) : ''}`);
    }
  }

  // ④ 편집 동작 — PC 첫 페이지, 실제 마우스로
  await pick('screen', 'first'); await pick('cls', 'pc');
  const SEL = '#prepareView > div:nth-of-type(1) > div > div:nth-of-type(2) > h2';   // 왼쪽 큰 제목 «이번 영화의 주인공은, 나.»
  // 앱 안 요소의 화면 좌표(편집판 쪽) = iframe 자리 + 요소 자리 × 배율
  const at = (sel, fx = 0.5, fy = 0.5) => evaluate(`(() => { const f = document.getElementById('app'), fr = f.getBoundingClientRect(), z = fr.width / f.offsetWidth;
    const r = f.contentDocument.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: fr.left + (r.left + r.width * ${fx}) * z, y: fr.top + (r.top + r.height * ${fy}) * z, z }; })()`);
  const mouse = async (type, x, y) => call('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const drag = async (a, b) => { await mouse('mouseMoved', a.x, a.y); await mouse('mousePressed', a.x, a.y); for (let i = 1; i <= 8; i++) await mouse('mouseMoved', a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8); await mouse('mouseReleased', b.x, b.y); await delay(200); };
  const nOps = () => evaluate("JSON.parse(localStorage.getItem('ps-editor-ops-v1') || '[]').length");
  const style = () => evaluate(`document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)}).style.cssText`);
  const click = async (p, modifiers = 0) => { await mouse('mouseMoved', p.x, p.y); await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1, modifiers }); await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1, modifiers }); await delay(150); };
  const p0 = await at(SEL);
  await click(p0);   // 먼저 눌러 고르고(고르지 않은 것은 끌어도 안 옮겨진다 — 10/23 여러 개 고르기)
  await drag(p0, { x: p0.x + 40, y: p0.y - 30 });
  if (await nOps() !== 1 || !/translate/.test(await style())) fail(`끌어 옮기기: 기록 ${await nOps()}건 · 스타일 «${await style()}»`);
  const before = await evaluate(`document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)}).getBoundingClientRect().toJSON()`);
  const corner = await at(SEL, 1, 1);
  await drag({ x: corner.x, y: corner.y }, { x: corner.x + 30, y: corner.y + 20 });
  const after = await evaluate(`document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)}).getBoundingClientRect().toJSON()`);
  if (await nOps() !== 2 || !(after.width > before.width + 10)) fail(`모서리 크기: 기록 ${await nOps()}건 · 폭 ${before.width} → ${after.width}`);
  if (Math.abs(after.left - before.left) > 2 || Math.abs(after.top - before.top) > 2) fail(`모서리 크기: 반대쪽 모서리가 움직임 (${before.left},${before.top}) → (${after.left},${after.top})`);
  const fs0 = await evaluate(`parseFloat(getComputedStyle(document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)})).fontSize)`);
  await evaluate("document.getElementById('tFontUp').click(), true");
  const fs1 = await evaluate(`parseFloat(getComputedStyle(document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)})).fontSize)`);
  if (fs1 !== fs0 + 1 || await nOps() !== 3) fail(`글자 +: ${fs0} → ${fs1} · 기록 ${await nOps()}건`);
  await evaluate("document.getElementById('tHide').click(), true");
  if (await evaluate(`document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)}).style.display`) !== 'none' || await nOps() !== 4) fail('숨기기');
  await evaluate("document.getElementById('tUndo').click(), true");
  if (await evaluate(`document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)}).style.display`) === 'none' || await nOps() !== 3) fail('되돌리기');
  // 다시 열면 바꾼 것이 다시 얹혀 있어야 한다
  await evaluate("document.getElementById('reload').click(), true");
  await idle();
  const re = await evaluate(`(() => { const el = document.getElementById('app').contentDocument.querySelector(${JSON.stringify(SEL)}); return { t: el.style.translate, w: el.style.width, f: el.style.fontSize }; })()`);
  if (!re.t || !re.w || !re.f) fail(`다시 열기 뒤 남아 있기: ${JSON.stringify(re)}`);
  // 내보내기 — 내려받기 대신 만든 파일 내용을 읽는다
  const exp = await evaluate(`(async () => { let cap; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) cap = { name: this.download, href: this.href }; else orig.call(this); };
    document.getElementById('tExport').click(); HTMLAnchorElement.prototype.click = orig; const j = JSON.parse(await (await fetch(cap.href)).text()); return { name: cap.name, n: j.바꾼것.length, kinds: j.바꾼것.map((x) => x.무엇을), first: j.바꾼것[0] }; })()`);
  if (exp.n !== 3 || !/^ps-editor-변경-\d{8}-\d{4}\.json$/.test(exp.name) || !exp.first?.css?.translate || !exp.first?.요소?.주소) fail(`내보내기: ${JSON.stringify(exp).slice(0, 300)}`);
  console.log(`편집 동작: 옮기기 · 크기 · 글자 + · 숨기기 · 되돌리기 · 다시 열기 · 내보내기(${exp.name}, ${exp.n}건: ${exp.kinds.join(' · ')})`);
  await shot('edit-pc-first.png');

  // ⑤ 여러 개 고르기(10/23 Bumm님 «블록 지정해서 여러 개 한꺼번에») — PC 2560 · 휴대폰 390×844, 실제 마우스로:
  //    고르지 않은 곳에서 상자 끌기 → N개 고름 → 하나를 끌어 함께 옮기기(간격 그대로 · 고르지 않은 것은 그대로) → Shift+누르기 더하기 · 빼기 →
  //    Del 한꺼번에 숨기기 → Ctrl+Z 한 번에 다시 보임 → 묶음 모서리 비율 크기 → Ctrl+Z → Ctrl+Z로 옮긴 것까지 처음대로
  const key = async (k, code, vk, modifiers = 0) => { for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk, modifiers }); await delay(150); };
  const inApp = (js) => evaluate(`(() => { const d = document.getElementById('app').contentDocument; ${js} })()`);
  const toPage = (r) => evaluate(`(() => { const f = document.getElementById('app'), fr = f.getBoundingClientRect(), z = fr.width / f.offsetWidth; const r = ${JSON.stringify(r)};
    return { x0: fr.left + r.x0 * z, y0: fr.top + r.y0 * z, x1: fr.left + r.x1 * z, y1: fr.top + r.y1 * z, z }; })()`);
  const selCount = async () => { const t = await evaluate("document.getElementById('selName').textContent"); const m = t.match(/^(\d+)개 고름/); return m ? +m[1] : t === '고른 요소 없음' ? 0 : 1; };
  for (const [cls, list, extra] of [['pc', '.genre-option', 4], ['phone', '.stepper > li', 2]]) {
    await pick('screen', 'first'); await pick('cls', cls);
    const tag = `여러 개 · ${cls} · 창 ${winOpt[0]}`, base = await nOps();   // 앞 시험의 기록이 남아 있어 그 수를 기준으로 센다
    // 고르기 · 옮기기 · 숨기기 · 되돌리기로 도구 줄이 접혀 앱 화면이 밀리면 안 된다(10/23 팀장: 창 800에서 안내 글이 길어져 35px 밀림)
    const where = () => evaluate("(() => ({ top: document.getElementById('app').getBoundingClientRect().top, tools: document.querySelector('.tools').offsetHeight }))()");
    const w0 = await where();
    const steady = async (step) => { const w = await where(); if (Math.abs(w.top - w0.top) > 0.5 || w.tools !== w0.tools) fail(`${tag}: ${step} 뒤 앱 화면이 밀림 — 위 ${w0.top} → ${w.top} · 도구 줄 ${w0.tools} → ${w.tools}`); };
    // 고를 것: 목록의 앞 N개(N = extra). 그다음 것은 «고르지 않은 것»으로 제자리인지 본다
    const box = await inApp(`const els = [...d.querySelectorAll(${JSON.stringify(list)})].slice(0, ${extra + 1}); if (els.length < ${extra + 1}) return null;
      const rs = els.map((e) => e.getBoundingClientRect()); const pick = rs.slice(0, ${extra});
      return { x0: Math.min(...pick.map((r) => r.left)) - 6, y0: Math.min(...pick.map((r) => r.top)) - 6, x1: Math.max(...pick.map((r) => r.right)) + 6, y1: Math.max(...pick.map((r) => r.bottom)) + 6,
        rest: rs[${extra}].toJSON(), first: rs[0].toJSON(), second: rs[1].toJSON() };`);
    if (!box) { fail(`${tag}: ${list}를 ${extra + 1}개 못 찾음`); continue; }
    const pg = await toPage(box);
    await drag({ x: pg.x0, y: pg.y0 }, { x: pg.x1, y: pg.y1 });
    const n = await selCount();
    if (n !== extra) fail(`${tag}: 상자로 고른 수 ${n}(기대 ${extra})`);
    await steady('상자로 고르기');
    await shot(`multi-${cls}-1-상자로고름.png`);
    // 함께 옮기기: 묶음 안 빈틈(고른 것 사이)을 잡고 끈다 — 묶음 안은 고른 요소 위가 아니어도 함께 옮기기여야 한다(10/23 팀장 확인)
    const gapX = (box.first.right + box.second.left) / 2, hasGap = box.second.left - box.first.right >= 4;
    const grabApp = hasGap ? { x0: gapX, y0: box.first.top + box.first.height / 2, x1: 0, y1: 0 } : { x0: box.first.left + box.first.width / 2, y0: box.first.top + box.first.height / 2, x1: 0, y1: 0 };
    const gp0 = await toPage(grabApp), grab = { x: gp0.x0, y: gp0.y0 };
    if (!hasGap) console.log(`${tag}: 고른 것 사이에 빈틈이 없어 첫 것을 잡고 옮긴다`);
    await drag(grab, { x: grab.x + 40 * pg.z, y: grab.y + 20 * pg.z });   // 화면 안에서 옮긴다
    const moved = await inApp(`const els = [...d.querySelectorAll(${JSON.stringify(list)})]; return { tr: els.slice(0, ${extra}).map((e) => e.style.translate), rest: els[${extra}].getBoundingClientRect().toJSON(), restTr: els[${extra}].style.translate };`);
    if (!moved.tr.every((t) => t && t === moved.tr[0])) fail(`${tag}: 함께 옮겨지지 않음 ${JSON.stringify(moved.tr)}`);
    if (Math.abs(moved.rest.left - box.rest.left) > 0.5 || Math.abs(moved.rest.top - box.rest.top) > 0.5 || moved.restTr) fail(`${tag}: 고르지 않은 것이 밀림 ${JSON.stringify(box.rest)} → ${JSON.stringify(moved.rest)}`);
    if (await nOps() !== base + extra) fail(`${tag}: 옮김 기록 ${await nOps() - base}건(기대 ${extra})`);
    await steady('함께 옮기기');
    await shot(`multi-${cls}-2-함께옮김.png`);
    // Shift+누르기: 다음 것을 더했다 빼기
    const restP = await toPage({ x0: box.rest.left + box.rest.width / 2, y0: box.rest.top + box.rest.height / 2, x1: 0, y1: 0 });
    await click({ x: restP.x0, y: restP.y0 }, 8);
    if (await selCount() !== extra + 1) fail(`${tag}: Shift+누르기 더하기 → ${await selCount()}`);
    await click({ x: restP.x0, y: restP.y0 }, 8);
    if (await selCount() !== extra) fail(`${tag}: Shift+누르기 빼기 → ${await selCount()}`);
    await steady('Shift+누르기');
    // Del: 한꺼번에 숨기기
    await key('Delete', 'Delete', 46);
    const hidden = await inApp(`return [...d.querySelectorAll(${JSON.stringify(list)})].slice(0, ${extra}).map((e) => e.style.display);`);
    if (!hidden.every((x) => x === 'none') || await nOps() !== base + extra * 2) fail(`${tag}: 숨기기 ${JSON.stringify(hidden)} · 기록 ${await nOps()}`);
    await steady('숨기기');
    await shot(`multi-${cls}-3-숨김.png`);
    // Ctrl+Z 한 번: 숨긴 것 모두 다시 보임
    await key('z', 'KeyZ', 90, 2);
    const back = await inApp(`return [...d.querySelectorAll(${JSON.stringify(list)})].slice(0, ${extra}).map((e) => e.style.display);`);
    if (back.some((x) => x === 'none') || await nOps() !== base + extra) fail(`${tag}: 되돌리기 한 번에 다시 보이지 않음 ${JSON.stringify(back)} · 기록 ${await nOps()}`);
    await steady('되돌리기');
    await shot(`multi-${cls}-4-되돌림.png`);
    // 묶음 모서리 비율 크기: 다시 고른 뒤 왼쪽 아래 손잡이(오른쪽은 화면 끝에 닿을 수 있다) — 반대쪽(오른쪽 위)이 제자리여야 한다
    await drag({ x: pg.x0 + 40 * pg.z, y: pg.y0 + 20 * pg.z }, { x: pg.x1 + 40 * pg.z, y: pg.y1 + 20 * pg.z });
    if (await selCount() !== extra) fail(`${tag}: 다시 상자로 고른 수 ${await selCount()}`);
    const g = await inApp(`const els = [...d.querySelectorAll(${JSON.stringify(list)})].slice(0, ${extra}); const rs = els.map((e) => e.getBoundingClientRect());
      return { x0: Math.min(...rs.map((r) => r.left)), y0: Math.min(...rs.map((r) => r.top)), x1: Math.max(...rs.map((r) => r.right)), y1: Math.max(...rs.map((r) => r.bottom)), gap: rs[1].left - rs[0].left };`);
    const gp = await toPage(g);
    await drag({ x: gp.x0, y: gp.y1 }, { x: gp.x0 - 40 * gp.z, y: gp.y1 + 40 * gp.z });
    const sc = await inApp(`const els = [...d.querySelectorAll(${JSON.stringify(list)})].slice(0, ${extra}); const rs = els.map((e) => e.getBoundingClientRect());
      return { sc: els.map((e) => e.style.scale), gap: rs[1].left - rs[0].left, x1: Math.max(...rs.map((r) => r.right)), y0: Math.min(...rs.map((r) => r.top)) };`);
    const k = +sc.sc[0];
    if (!(k > 1.02) || !sc.sc.every((x) => x === sc.sc[0])) fail(`${tag}: 묶음 비율 크기 ${JSON.stringify(sc.sc)}`);
    if (Math.abs(sc.gap / g.gap - k) > 0.03) fail(`${tag}: 간격이 같은 비율로 안 커짐 ${g.gap} → ${sc.gap}(×${k})`);
    if (Math.abs(sc.x1 - g.x1) > 2 || Math.abs(sc.y0 - g.y0) > 2) fail(`${tag}: 묶음 오른쪽 위가 움직임 (${g.x1},${g.y0}) → (${sc.x1},${sc.y0})`);
    await shot(`multi-${cls}-5-비율크기.png`);
    await key('z', 'KeyZ', 90, 2);   // 비율 크기 되돌리기
    await key('z', 'KeyZ', 90, 2);   // 함께 옮긴 것 되돌리기
    const reset = await inApp(`return [...d.querySelectorAll(${JSON.stringify(list)})].slice(0, ${extra}).map((e) => (e.style.translate || '') + '|' + (e.style.scale || ''));`);
    if (reset.some((x) => x !== '|') || await nOps() !== base) fail(`${tag}: 처음대로 안 돌아감 ${JSON.stringify(reset)} · 기록 ${await nOps()}`);
    console.log(`${tag}: 상자 ${extra}개 · 함께 옮김 · Shift 더하기/빼기 · 한꺼번에 숨김 · 한 번에 되돌림 · 묶음 비율 ×${k}`);
  }

  // ③ 밖으로 나간 요청
  if (outside.length) fail(`편집판 밖으로 나간 요청 ${outside.length}건: ${[...new Set(outside)].slice(0, 5).join(' , ')}`);
  else console.log('밖으로 나간 요청 0건');
  ws.close();
} finally {
  chrome.kill(); await delay(400);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
console.log(fails.length ? `❌ 어긋남 ${fails.length}건 (화면: ${out})` : `✅ 모두 통과 (화면: ${out})`);
process.exit(fails.length ? 1 : 0);

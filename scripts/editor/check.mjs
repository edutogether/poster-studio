#!/usr/bin/env node
/* 화면 편집판 점검(2026-10-23) — 편집판을 창 없는 크롬으로 열어 4갈래 × 10화면을 모두 열어 보고, 편집 동작을 실제 마우스로 해 본다.

     node scripts/editor/check.mjs [편집판 주소] [결과 폴더] [갈래...]     기본 주소 http://127.0.0.1:5390/__editor/ (편집판 서버가 떠 있어야 한다), 갈래를 적으면 그 갈래만(pc · tablet-l · tablet-p · phone)

   본다: ① 화면마다 «가지 못했습니다» 없이 도착하는가 ② 앱 창 크기가 그 갈래의 기준 크기와 같은가(스크롤 막대가 폭을 먹지 않는가)
   ③ 편집판 밖(127.0.0.1 말고)으로 나간 요청이 0건인가 — AI 생성 · 서버 호출이 없어야 한다
   ④ PC 첫 페이지에서 끌어 옮기기 · 모서리 크기 · 글자 + · 숨기기 · 되돌리기 · 다시 열면 남아 있기 · 내보내기 파일 내용.
   화면마다 편집판 화면을 «갈래-화면.png»로 남긴다. 하나라도 어긋나면 종료코드 1. 브라우저 저장소는 임시 프로필이라 사람이 쓰는 편집판의 바꾼 목록은 건드리지 않는다. */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const [urlArg, outArg] = process.argv.slice(2);
const url = urlArg || 'http://127.0.0.1:5390/__editor/';
const origin = new URL(url).origin;
const out = path.resolve(outArg || path.join(os.tmpdir(), 'ps-editor-check'));
await fs.mkdir(out, { recursive: true });
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
const CLASSES = { pc: [2560, 1440], 'tablet-l': [1366, 1024], 'tablet-p': [1024, 1366], phone: [390, 844] };
const SCREENS = ['splash', 'first', 'step1', 'pre-solo', 'pre-group', 'live', 'shot', 'loading', 'result', 'save'];

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ps-editor-check-'));
const port = 9690;
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--window-size=1700,1100',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const fails = [];
const fail = (what) => { fails.push(what); console.log('❌ ' + what); };
try {
  let target;
  for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
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
  const only = process.argv.slice(4);   // 셋째 인자부터: 이 갈래만(예: phone)
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
  const p0 = await at(SEL);
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

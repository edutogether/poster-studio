#!/usr/bin/env node
/* 해상도 구간 조사(2026-10-23 Bumm님 «2560에서만 개발하다 보니 해상도가 낮아지면 겹치고 잘린다», 팀장 전달) — 고치기 전에 재는 도구.

     node scripts/verify/viewport-survey.mjs <주소> <결과 폴더> [--sizes 1366x768,...]

   크기마다 같은 흐름(1단계 → 2단계 찍기 전 → 카메라 켠 뒤 → 찍은 뒤 → 로딩 → 3단계 → 저장 · 출력)을 지나며 화면마다 잰다:
   ① 가로 스크롤(문서 폭 > 화면 폭) ② 화면 밖(오른쪽 · 왼쪽으로 삐져나간 요소 — 잘라 내는 부모가 없을 때)
   ③ 잘린 글자(overflow로 감춘 칸보다 글이 김 · 말줄임) ④ 겹침(흐름 안에 놓인 글 · 그림 · 단추끼리 4px 넘게 포개짐 — 일부러 얹은 절대 위치 표시는 뺀다)
   ⑤ 아래로 잘림(화면 높이에 맞춘 칸 안에서 내용이 칸보다 길어 감춰짐).
   결함이 있는 화면은 «크기-화면.png»(원본 해상도)로 남기고, 모두를 report.json · report.md 표로 낸다.
   카메라는 가짜(라이브의 공개 예시 인물), 생성(/generate)은 페이지 안에서 답한다 — 네트워크로 나가면 종료코드 2. 휴대폰 크기는 아이폰, 태블릿은 아이패드로 흉내 낸다. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [url, outArg] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sizes');
if (!url || !outArg) { console.error('사용법: node scripts/verify/viewport-survey.mjs <주소> <결과 폴더> [--sizes WxH,...]'); process.exit(2); }
const DEFAULT = '1024x768,1280x800,1366x768,1440x900,1536x864,1600x900,1920x1080,2560x1440,768x1024,1024x768,820x1180,1180x820,1024x1366,1366x1024,360x640,390x664,430x740';
const sizes = opt('--sizes', DEFAULT).split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
const TABLETS = new Set(['768x1024', '1024x768', '820x1180', '1180x820', '1024x1366', '1366x1024']);
const kind = ({ w, h }) => (w <= 760 ? 'phone' : TABLETS.has(`${w}x${h}`) ? 'tablet' : 'pc');
const UA = {
  phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  tablet: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};
const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const base = url.replace(/\/?$/, '/');
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'survey-'));
const art = path.join(profile, 'art.webp');
await fs.writeFile(art, Buffer.from(await (await fetch(base + 'studio/camera-student.webp')).arrayBuffer()));
// 가짜 카메라는 가로(PC · 태블릿 노트북 카메라)와 세로(휴대폰) 두 벌 — 크롬 한 번에 한 파일이라 갈래마다 크롬을 새로 띄운다
const y4m = (w, h) => { const f = path.join(profile, `cam-${w}x${h}.y4m`); const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', art, '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, f]); if (r.status !== 0) throw new Error('y4m: ' + r.stderr); return f; };

const MEASURE = `(() => {
  const W = innerWidth, H = innerHeight;
  const vis = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
  const name = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 22); return (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '')) + (t ? ' «' + t + '»' : ''); };
  const clipsX = (el) => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { const r = a.getBoundingClientRect(); if (r.left >= -1 && r.right <= W + 1) return true; } } return false; };
  const floating = (el) => { for (let x = el; x && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'absolute' || p === 'fixed' || p === 'sticky') return true; } return false; };
  const inModalOrHidden = (el) => !!el.closest('dialog:not([open]), [hidden], [aria-hidden="true"]');
  const hscroll = Math.max(0, document.documentElement.scrollWidth - W);
  const off = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if ((r.right > W + 1 || r.left < -1) && !clipsX(el) && getComputedStyle(el).position !== 'fixed') off.push(name(el) + ' ' + Math.round(r.left) + '~' + Math.round(r.right));
  }
  const clipped = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el); const hides = /(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none';
    if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) clipped.push(name(el) + ' ' + el.scrollWidth + '/' + el.clientWidth + '×' + el.scrollHeight + '/' + el.clientHeight);
  }
  // 겹침: 흐름 안의 «잎» 덩어리(글이 직접 든 요소 · 그림 · 영상 · 캔버스 · 단추 · 입력칸)끼리
  const leaves = [...document.body.querySelectorAll('img, video, canvas, button, input, textarea, select, h1, h2, h3, p, li, label, span, strong, a')].filter((el) => {
    if (!vis(el) || inModalOrHidden(el) || floating(el)) return false;
    if (/^(SPAN|STRONG|A|LABEL)$/.test(el.tagName) && el.closest('button, a, p, h1, h2, h3, li, label') !== el) return false;   // 문장 안의 조각은 문장으로 센다
    const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4;
  }).map((el) => ({ el, r: el.getBoundingClientRect() }));
  const overlaps = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ow = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), oh = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ow > 4 && oh > 4) overlaps.push(name(a.el) + ' ↔ ' + name(b.el) + ' ' + Math.round(ow) + '×' + Math.round(oh) + ' @' + Math.round(Math.max(a.r.left, b.r.left)) + ',' + Math.round(Math.max(a.r.top, b.r.top) + scrollY));
  }
  // 아래로 잘림: 세로 overflow를 감춘 칸(화면 높이에 맞춘 칸)보다 내용이 긴 곳
  const cutY = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el)) continue; const s = getComputedStyle(el);
    if (/(hidden|clip)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 40 && !/carousel|gallery|dialog-carousel/.test(el.className)) cutY.push(name(el) + ' ' + el.scrollHeight + '/' + el.clientHeight);
  }
  return { hscroll, off: [...new Set(off)].slice(0, 12), clipped: clipped.slice(0, 12), overlaps: overlaps.slice(0, 12), cutY: cutY.slice(0, 8), docH: document.documentElement.scrollHeight, H };
})()`;

const report = [];
let generateSeen = 0;
let port = 9580;
const groups = [['pc', [1280, 720]], ['tablet', [1280, 720]], ['phone', [960, 1280]]];
try {
  for (const [g, [cw, ch]] of groups) {
    const list = sizes.filter((s) => kind(s) === g);
    if (!list.length) continue;
    const cam = y4m(cw, ch);
    port += 1;
    const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`,
      `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(profile, 'chrome-' + g)}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    try {
      let target;
      for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
      if (!target) throw new Error('크롬에 붙지 못했다');
      const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      let seq = 0; const pending = new Map();
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === 'Network.requestWillBeSent' && /\/generate/.test(m.params.request.url)) generateSeen++; if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
      const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
      const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 200)); return m.result?.result?.value; };
      const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr).catch(() => false)) return true; await delay(100); } return false; };
      await call('Network.enable');
      await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net*/generate*'] });
      await call('Page.enable');
      if (g !== 'pc') { await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await call('Emulation.setUserAgentOverride', { userAgent: UA[g] }); }
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
        const net = window.fetch.bind(window);
        window.fetch = async (input, init) => { const u = String((input && input.url) || input); if (!/\\/generate/.test(u)) return net(input, init);
          await new Promise((r) => setTimeout(r, 3000)); const b = await (await net('/studio/camera-student.webp')).blob();
          const data = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
          return new Response(JSON.stringify({ images: [data] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
        window.print = () => {}; navigator.canShare = () => true; navigator.share = async () => {};
        ${g === 'phone' ? `const md = navigator.mediaDevices; const gum = md.getUserMedia.bind(md); md.getUserMedia = (c) => { const v = c && c.video; return gum(v && typeof v === 'object' && v.width && v.height ? { ...c, video: { ...v, width: v.height, height: v.width } } : c); };` : ''}
      })();` });
      for (const { w, h } of list) {
        const tag = `${w}x${h}`;
        await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: g !== 'pc' });
        const shot = async (screen) => {
          await delay(500);
          const m = await evaluate(MEASURE);
          const bad = m.hscroll || m.off.length || m.clipped.length || m.overlaps.length || m.cutY.length;
          report.push({ size: tag, kind: g, screen, ...m, bad: !!bad });
          if (bad) {
            const metrics = await call('Page.getLayoutMetrics');
            const fullH = Math.min(Math.ceil(metrics.result.cssContentSize.height), 8000);
            const s = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: fullH, scale: 1 } });
            await fs.writeFile(path.join(out, `${tag}-${screen}.png`), Buffer.from(s.result.data, 'base64'));
          }
          console.log(`${tag} ${screen}: ${bad ? `가로 ${m.hscroll} · 화면 밖 ${m.off.length} · 잘림 ${m.clipped.length} · 겹침 ${m.overlaps.length} · 아래 잘림 ${m.cutY.length}` : '깨끗'}`);
        };
        try {
          await call('Page.navigate', { url: base });
          if (!await waitFor('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")', 20000)) throw new Error('첫 화면');
          await evaluate('document.fonts.ready.then(() => true)'); await delay(600);
          await shot('1-1단계');
          await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); document.getElementById("prepareNextBtn").click(); true');
          if (!await waitFor('!document.getElementById("cameraView").hidden')) throw new Error('2단계');
          await delay(1200); await evaluate('scrollTo(0, 0); true');
          await shot('2-2단계-찍기전');
          const phoneBtn = await evaluate("(() => { const b = document.getElementById('phoneShotBtn'); return !!b && getComputedStyle(b).display !== 'none'; })()");
          if (!phoneBtn) { await evaluate("document.getElementById('startBtn').click(); true"); }
          else { await evaluate("document.getElementById('phoneShotBtn').click(); true"); }
          if (!await waitFor('(() => { const v = document.getElementById("video"); return !!v && !v.classList.contains("hidden") && v.videoWidth > 0; })()')) throw new Error('카메라');
          await delay(900);
          await shot('3-2단계-켠뒤');
          if (!phoneBtn) await evaluate("document.getElementById('shotBtn').click(); true");
          if (!await waitFor('!document.getElementById("generateBtn").hidden', 20000)) throw new Error('촬영');
          await waitFor('!document.querySelector(".captured-badge, .camera-capture-notice")', 6000);
          await shot('4-2단계-찍은뒤');
          await evaluate("document.getElementById('generateBtn').click(); true");
          if (!await waitFor('!!document.getElementById("spinner")?.open')) throw new Error('로딩');
          await delay(1200);
          await shot('5-로딩');
          if (!await waitFor('!document.getElementById("resultView").hidden', 60000)) throw new Error('3단계');
          await delay(3500); await evaluate('scrollTo(0, 0); true');
          await shot('6-3단계');
          const save = await evaluate("(() => { const b = document.getElementById('saveBtn'); if (b && getComputedStyle(b).display !== 'none') { b.click(); return 'save'; } document.getElementById('printBtn').click(); return 'print'; })()");
          await delay(800);
          await shot(save === 'save' ? '7-저장' : '7-출력');
        } catch (e) {
          report.push({ size: tag, kind: g, screen: '흐름', error: e.message, bad: true });
          console.log(`${tag}: ${e.message}에서 막힘`);
        }
      }
      ws.close();
    } finally { chrome.kill(); await delay(400); }
  }
} finally {
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
// 표: 크기 × 화면, 칸에는 결함 종류 수
const screens = [...new Set(report.filter((r) => r.screen !== '흐름').map((r) => r.screen))];
const lines = ['| 크기 | 갈래 | ' + screens.join(' | ') + ' |', '|---|---|' + screens.map(() => '---|').join('')];
for (const { w, h } of sizes) {
  const tag = `${w}x${h}`; const rs = report.filter((r) => r.size === tag);
  const cell = (s) => { const r = rs.find((x) => x.screen === s); if (!r) return rs.find((x) => x.error) ? '막힘' : '—'; if (!r.bad) return '🟢';
    const k = []; if (r.hscroll) k.push(`가로${r.hscroll}`); if (r.off.length) k.push(`밖${r.off.length}`); if (r.clipped.length) k.push(`잘림${r.clipped.length}`); if (r.overlaps.length) k.push(`겹침${r.overlaps.length}`); if (r.cutY.length) k.push(`아래${r.cutY.length}`); return '🔴 ' + k.join(' '); };
  lines.push(`| ${tag} | ${rs[0]?.kind || kind({ w, h })} | ${screens.map(cell).join(' | ')} |`);
}
await fs.writeFile(path.join(out, 'report.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (generateSeen) { console.error(`❌ 생성 요청이 네트워크에 ${generateSeen}건 잡혔다`); process.exit(2); }

/* 첫 화면 «의견 보내기» 확인(2026-11-05, _docs/intents/2026-11-05-field-feedback — 11/4 시안 자리 · 크기).

     node scripts/verify/feedback-link-probe.mjs <dist 폴더> <결과 폴더> --before <기능 넣기 전 dist 폴더>

   dist를 127.0.0.1의 작은 서버로 열고 크롬을 헤드리스로 띄워 PC 3크기(1366×768 · 1920×1080 · 2560×1440, 1배) · 세로 태블릿(1024×1366, 2배) ·
   휴대폰 3크기(360×780 · 390×844 · 430×932, 3배) · 휴대폰 가로(844×390, 3배 — PC 화면)를 원본 해상도로 따로 찍는다
   (<결과 폴더>/home-<크기>.png · dialog-<크기>.png). 바깥 주소는 하나도 나가지 않는다 — AI 서버 확인(/health)과 의견 보내기(/feedback)는
   이 도구가 대신 답하고, 그 밖의 https는 막는다(실제 서버 요청 0건 · 카카오 알림 0건).

   재는 것(하나라도 걸리면 종료코드 1):
     ① 링크가 개인정보처리방침과 같은 줄 · 같은 글자 크기 · 같은 색. PC · 태블릿은 다운로드 아이콘 왼쪽 16px, 휴대폰은 방침 왼쪽 14px
     ② 다른 글자 · 누르는 것과 안 겹침 · 화면 안. 휴대폰은 누르는 높이 44px 이상(방침 링크와 같음)
     ③ 기능 넣기 전 빌드(--before)의 같은 크기 첫 화면과 화소 대조 — 링크 상자 밖 차이 0(링크가 다른 것을 한 화소도 밀지 않는다).
        링크만 숨겨 견주지 않는다: 머리글 칸 하나를 숨기거나 보이면 크롬이 PC 머리글 로고를 다시 그리며 화소가 갈린다(11/5 실측 — 기존 다운로드 아이콘을 숨겨도
        같은 1,507화소). 같은 판을 다시 열어도 큰 그림을 줄여 그리는 순간이 달라 갈릴 수 있어 TRIES번까지 열어 «링크 밖 0»인 짝을 찾는다(download-button-probe.mjs와 같은 방식).
     ④ 창: 화면 안(넘치면 창 안에서 스크롤) · 가로 넘침 없음 · 글자 잘림 없음 · 단추 둘이 같은 크기(120×44) · 안내 한 줄 · 이름 칸 초점 테두리 = 의견 칸
     ④-2 의견 안내 한 줄 · 글자 수는 입력칸 위 오른쪽 끝 · 안 겹침 · «함께 보내는 것» 줄이 입력칸 아래 4px(2026-11-07)
     ⑤ 네트워크(1920×1080): 접속 · 창 열기까지 /feedback 0건 → 보내면 1건(여섯 칸 JSON · 부스 토큰) → «보냈어요»
     ⑥ 2단계에는 링크가 없다 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const args = process.argv.slice(2);
const [dist, out] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--before');
const SAME_LINK = args.includes('--same-link');   // 링크가 이미 있는 빌드와 견줄 때(창만 고친 판) — 링크 글자 차이가 없어도 통과
const beforeDist = args.includes('--before') ? args[args.indexOf('--before') + 1] : null;
if (!dist || !out || !fs.existsSync(path.join(dist, 'index.html')) || !beforeDist || !fs.existsSync(path.join(beforeDist, 'index.html'))) {
  console.error('사용: feedback-link-probe.mjs <dist 폴더> <결과 폴더> --before <기능 넣기 전 dist 폴더>');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
const root = path.resolve(dist);
const SIZES = [
  { name: '1280x587', w: 1280, h: 587, s: 1 }, { name: '1366x697', w: 1366, h: 697, s: 1 }, { name: '1536x793', w: 1536, h: 793, s: 1 }, { name: '1366x768', w: 1366, h: 768, s: 1 }, { name: '1920x1080', w: 1920, h: 1080, s: 1 }, { name: '2560x1440', w: 2560, h: 1440, s: 1 },
  { name: '1024x1366', w: 1024, h: 1366, s: 2, touch: true },
  { name: '360x780', w: 360, h: 780, s: 3, mobile: true, phone: true }, { name: '390x844', w: 390, h: 844, s: 3, mobile: true, phone: true },
  { name: '430x932', w: 430, h: 932, s: 3, mobile: true, phone: true }, { name: '844x390', w: 844, h: 390, s: 3, mobile: true },
];
const TYPE = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const serve = async (dir) => {
  const top = path.resolve(dir);
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(top, p);
    if (!f.startsWith(top + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPE[path.extname(f)] ?? 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, url: `http://127.0.0.1:${srv.address().port}` };
};
const { srv: server, url: base } = await serve(root);
const { srv: beforeServer, url: beforeBase } = await serve(beforeDist);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-probe-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });

let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } }
const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map(); const handlers = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method) handlers.forEach((h) => h(m)); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

// 바깥 주소: /health는 «정상», /feedback은 받은 본문 · 머리글을 적고 {ok:true}, 나머지는 막고 적는다
const log = { outside: [], feedback: [] };
handlers.push(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const { url, method, headers, postData } = m.params.request;
  log.outside.push(url);
  const json = (obj) => send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }, { name: 'access-control-allow-headers', value: '*' }], body: Buffer.from(JSON.stringify(obj)).toString('base64') });
  if (/\/health$/.test(url)) await json({ ok: true, openaiReachable: true });
  else if (/\/feedback$/.test(url)) { if (method === 'POST') log.feedback.push({ headers, body: postData }); await json({ ok: true }); }
  else await send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' });
});
await send('Page.enable');
await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });

const report = { dist: root, before: path.resolve(beforeDist), sizes: {}, checks: [] };
const check = (name, ok, detail) => { report.checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? '통과' : '걸림'}  ${name}${detail === undefined ? '' : ' — ' + JSON.stringify(detail)}`); };
const setSize = async (s) => {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.s, mobile: !!s.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!(s.mobile || s.touch), maxTouchPoints: s.mobile || s.touch ? 5 : 0 });
};
const settle = async () => {
  await evaluate(`Promise.all([...document.images].map((i) => i.decode().catch(() => {})))`);
  await sleep(500);
  // 한 번 도는 애니메이션(등장 페이드 등)은 끝 장면으로, 되풀이하는 것(휴대폰 «아래로» 화살표 등)은 0초에 세운다 — 0초에 세우면 등장 중간 장면이 찍혀 두 장이 갈린다
  await evaluate(`(document.getAnimations().forEach((a) => { if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish(); else { a.pause(); a.currentTime = 0; } }), new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))`);
  await sleep(200);
};
const open = async (at = base) => {
  await send('Page.navigate', { url: `${at}/` });
  await evaluate(`new Promise((r) => { const t = setInterval(() => { if (document.body.classList.contains('app-ready') && !document.getElementById('splash')) { clearInterval(t); r(); } }, 100); setTimeout(() => { clearInterval(t); r(); }, 10000); })`);
  await evaluate(`document.fonts.ready`);
  await settle();
};
const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); const p = path.join(out, file); fs.writeFileSync(p, Buffer.from(r.result.data, 'base64')); return p; };
const readPng = async (file) => { const img = await loadImage(file); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0); return { w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data }; };
const press = async (sel) => {
  const r = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
};

for (const s of SIZES) {
  await setSize(s);
  await open();
  const homePath = await shot(`home-${s.name}.png`);
  const m = await evaluate(`(() => {
    const R = (r) => ({ x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom });
    const link = document.querySelector('.feedback-link'), privacy = document.querySelector('.privacy-link'), dl = document.querySelector('.download-link');
    if (!link || !privacy) return null;
    const textOf = (e) => { const rg = document.createRange(); rg.selectNodeContents(e); return R(rg.getBoundingClientRect()); };
    const a = R(link.getBoundingClientRect()), at = textOf(link), pt = textOf(privacy);
    const dlShown = dl && getComputedStyle(dl).display !== 'none';
    const dlBox = dlShown ? R(dl.querySelector('svg').getBoundingClientRect()) : null;
    const shown = (e) => { for (let x = e; x && x !== document.body; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; } return true; };
    const hit = [];
    const over = (r) => r.width && r.height && r.right > at.x && r.x < at.r && r.bottom > at.y && r.y < at.b;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode, pe = n.parentElement;
      if (!n.textContent.trim() || link.contains(pe) || !shown(pe)) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      for (const r of rg.getClientRects()) if (over(r)) hit.push('글자 «' + n.textContent.trim().slice(0, 20) + '»');
    }
    for (const e of document.querySelectorAll('button, a, input, select, textarea')) {
      if (e === link || !shown(e)) continue;
      const r = e === dl ? (dlBox && { width: dlBox.w, height: dlBox.h, x: dlBox.x, y: dlBox.y, right: dlBox.r, bottom: dlBox.b }) : e.getBoundingClientRect();
      if (r && over(r)) hit.push(e.tagName + ' ' + (e.id || e.className));
    }
    const cs = getComputedStyle(link), ps = getComputedStyle(privacy);
    return { innerWidth, device: document.documentElement.dataset.device, link: a, text: at, privacyText: pt, download: dlBox,
      gap: dlBox ? dlBox.x - at.r : pt.x - at.r, gapTo: dlBox ? '다운로드 아이콘' : '개인정보처리방침',
      sameLine: Math.abs((at.y + at.h / 2) - (pt.y + pt.h / 2)), font: [cs.fontSize, ps.fontSize], color: [cs.color, ps.color], hit,
      inView: a.x >= 0 && a.r <= innerWidth && a.y >= 0 && a.b <= innerHeight };
  })()`);
  report.sizes[s.name] = { measure: m };
  const want = m && (m.download ? 16 : 14);
  check(`${s.name}: ${m?.gapTo ?? '?'} 왼쪽 ${want}px · 방침과 같은 줄 · 같은 글자 크기 · 같은 색`, m && Math.abs(m.gap - want) <= 1 && m.sameLine <= 1 && m.font[0] === m.font[1] && m.color[0] === m.color[1],
    m && { gap: Math.round(m.gap * 10) / 10, sameLine: m.sameLine, font: m.font, color: m.color, device: m.device });
  check(`${s.name}: 휴대폰은 다운로드 아이콘 없이 방침 바로 왼쪽 · 그 밖은 아이콘 왼쪽`, m && (s.phone ? !m.download : !!m.download), m && { download: !!m.download });
  check(`${s.name}: 다른 요소와 안 겹침 · 화면 안`, m && m.hit.length === 0 && m.inView, m && { hit: m.hit, inView: m.inView });
  if (s.phone) check(`${s.name}: 누르는 높이 44px 이상`, m && m.link.h >= 44, m && Math.round(m.link.h));

  // 기능 넣기 전 빌드와 대조 — 링크 상자 밖 차이 0
  if (m) {
    const TRIES = 3;
    const k = (await readPng(homePath)).w / m.innerWidth, pad = 2;
    const box = [Math.floor((m.link.x - pad) * k), Math.floor((m.link.y - pad) * k), Math.ceil((m.link.r + pad) * k), Math.ceil((m.link.b + pad) * k)];
    const afters = [homePath], befores = [];
    let best = null;
    for (let t = 1; t <= TRIES && !(best?.outside === 0); t++) {
      await open(beforeBase);
      befores.push(await shot(`before-${s.name}-${t}.png`));
      if (t > 1) { await open(); afters.push(await shot(`home-${s.name}-${t}.png`)); }
      for (const ap of afters) for (const bp of befores) {
        const [A, B] = await Promise.all([readPng(ap), readPng(bp)]);
        if (A.w !== B.w || A.h !== B.h) continue;
        let outside = 0, inside = 0;
        for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
          const q = (y * A.w + x) * 4;
          if (A.data[q] === B.data[q] && A.data[q + 1] === B.data[q + 1] && A.data[q + 2] === B.data[q + 2]) continue;
          if (x >= box[0] && x < box[2] && y >= box[1] && y < box[3]) inside += 1; else outside += 1;
        }
        if (!best || outside < best.outside) best = { after: path.basename(ap), before: path.basename(bp), outside, inside, box };
      }
    }
    report.sizes[s.name].pixels = best;
    check(`${s.name}: 기능 넣기 전 빌드와 대조 — 링크 밖 차이 0(링크 글자는 있음)`, best && best.outside === 0 && (SAME_LINK || best.inside > 0), best);
    await open();
  }

  // 창
  if (m) {
    await press('.feedback-link');
    await sleep(400);
    await shot(`dialog-${s.name}.png`);
    const d = await evaluate(`(() => {
      const dlg = document.querySelector('.feedback-dialog'); if (!dlg) return null;
      const r = dlg.getBoundingClientRect();
      const clipped = [];
      for (const e of dlg.querySelectorAll('h2, p, label, button, span')) if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') clipped.push(e.className || e.tagName);
      const cancel = dlg.querySelector('.feedback-cancel').getBoundingClientRect(), sendB = dlg.querySelector('.feedback-send').getBoundingClientRect();
      return { box: { x: r.x, y: r.y, r: r.right, b: r.bottom }, innerWidth, innerHeight, scroll: dlg.scrollHeight > dlg.clientHeight, hOverflow: dlg.scrollWidth > dlg.clientWidth || document.documentElement.scrollWidth > innerWidth,
        clipped, buttons: [cancel.width, cancel.height, sendB.width, sendB.height].map(Math.round),
        subLines: Math.round(dlg.querySelector('.feedback-sub').getBoundingClientRect().height / parseFloat(getComputedStyle(dlg.querySelector('.feedback-sub')).lineHeight)),
        subOverflow: dlg.querySelector('.feedback-sub').scrollWidth > dlg.querySelector('.feedback-sub').clientWidth,
        textH: Math.round(dlg.querySelector('textarea').getBoundingClientRect().height), lines: (() => { const L = (e) => { const g = document.createRange(); g.selectNodeContents(e); return new Set([...g.getClientRects()].filter((r) => r.width > 1).map((r) => Math.round(r.y / 8))).size; }; const hints = [...dlg.querySelectorAll('.feedback-hint')]; const row = dlg.querySelector('.feedback-text-head'), c = dlg.querySelector('.feedback-count').getBoundingClientRect(), t = dlg.querySelector('textarea').getBoundingClientRect(), au = dlg.querySelector('.feedback-auto').getBoundingClientRect(), lb = dlg.querySelector('label[for=feedbackText]'); const g = document.createRange(); g.selectNodeContents(lb); const lr = g.getBoundingClientRect(); return { nameHint: L(hints[0]), textHint: L(hints[1]), countAbove: c.bottom <= t.top + 1, countRight: Math.abs(c.right - t.right) <= 1, countClash: !!row && [...g.getClientRects()].some((r) => r.width > 1 && r.right > c.left - 2 && r.bottom > c.top && r.top < c.bottom), autoGap: Math.round(au.top - t.bottom), height: Math.round(dlg.getBoundingClientRect().height) }; })(), rings: ['feedbackName', 'feedbackText'].map((id) => { const e = document.getElementById(id); e.focus(); const c = getComputedStyle(e); return [c.outlineStyle, c.outlineColor, c.outlineWidth, c.outlineOffset].join(' '); }) };
    })()`);
    report.sizes[s.name].dialog = d;
    check(`${s.name}: 창이 화면 안 · 가로 넘침 없음 · 글자 잘림 없음`, d && d.box.x >= 0 && d.box.y >= 0 && d.box.r <= d.innerWidth && d.box.b <= d.innerHeight && !d.hOverflow && d.clipped.length === 0, d);
    check(`${s.name}: 단추 둘이 같은 크기 120×44 · 안내 한 줄 · 의견 칸 높이 96 · 이름 칸 초점 테두리 = 의견 칸 · 빨간 테두리 아님`, d && d.buttons.join() === '120,44,120,44' && d.subLines === 1 && !d.subOverflow && d.textH === 96 && d.rings[0] === d.rings[1] && !/229, 45, 36/.test(d.rings[0]), d && { buttons: d.buttons, subLines: d.subLines, subOverflow: d.subOverflow, textH: d.textH, rings: d.rings });
    check(`${s.name}: 의견 안내 한 줄 · 글자 수는 입력칸 위 오른쪽 끝 · 안 겹침 · «함께 보내는 것» 줄이 입력칸 아래 4px${s.phone ? '' : ' · 이름 안내 한 줄'}`, d && d.lines.textHint === 1 && d.lines.countAbove && d.lines.countRight && !d.lines.countClash && d.lines.autoGap === 4 && (s.phone || d.lines.nameHint === 1), d && d.lines);
    await press('.feedback-cancel');
    await sleep(200);
  }
}

// 네트워크와 보내기(1920×1080)
await setSize(SIZES[1]);
log.outside.length = 0; log.feedback.length = 0;
await open();
await press('.feedback-link');
await sleep(300);
const beforeSend = log.outside.filter((u) => /\/feedback$/.test(u)).length;
const sawHealth = log.outside.some((u) => /\/health$/.test(u));
check('접속 · 창 열기까지 /feedback 요청 0건(가로채기가 /health를 본 뒤의 0건)', sawHealth && beforeSend === 0, { sawHealth, beforeSend });
await evaluate(`(() => {
  const set = (el, v) => { const proto = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  set(document.getElementById('feedbackName'), '시험 진행자');
  set(document.getElementById('feedbackText'), '시험 의견입니다.');
})()`);
await press('.feedback-send');
await sleep(1200);
const sent = log.feedback[0];
const body = sent ? JSON.parse(sent.body) : null;
check('보내면 /feedback 1건 — 여섯 칸 JSON · 부스 토큰', log.feedback.length === 1 && body && Object.keys(body).sort().join() === 'device,name,screen,step,text,version' && body.name === '시험 진행자' && body.step === 1
  && Object.keys(sent.headers).some((h) => h.toLowerCase() === 'x-booth-token'), body);
const after = await evaluate(`document.querySelector('.feedback-dialog h2')?.textContent`);
check('보낸 뒤 «보냈어요»', after === '보냈어요', after);
await shot('sent-1920x1080.png');
await press('.feedback-send');
await sleep(200);
await evaluate(`document.getElementById('prepareNextBtn').click()`);
await sleep(1200);
const step2 = await evaluate(`({ step: document.body.dataset.step, link: !!document.querySelector('.feedback-link') })`);
check('2단계에는 링크가 없다', step2.step === '2' && !step2.link, step2);
check('바깥 주소는 /health · /feedback뿐(이 도구가 대신 답함 — 실제로 나간 것 0)', log.outside.length > 0 && log.outside.every((u) => /\/(health|feedback)$/.test(u)), log.outside);

ws.close(); chrome.kill(); server.close(); beforeServer.close();
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const failed = report.checks.filter((c) => !c.ok);
console.log(failed.length ? `걸림 ${failed.length}건 / ${report.checks.length}` : `모두 통과 ${report.checks.length}건`);
process.exit(failed.length ? 1 : 0);

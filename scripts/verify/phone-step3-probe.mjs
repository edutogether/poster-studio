/* 휴대폰 3단계(포스터 고르기) 손가락 · 마우스 확인(2026-10-20 Bumm님, 팀장 전달).

     node scripts/verify/phone-step3-probe.mjs <주소> <결과 폴더>

   기기 셋: 아이폰 사파리 UA(390×664 · 3배, 터치) · 갤럭시 삼성 인터넷 UA(360×740 · 3배, 터치) · PC 좁은 창(390×664, 윈도 크롬 UA, 마우스).
   기기마다 샘플 흐름으로 3단계까지 가서 판정한다(하나라도 어긋나면 종료코드 1):
   ① 포스터 아래 이름이 영어(로마자 · 띄어쓰기만)이고 «/»(순번)가 없다
   ② 오른쪽 › 를 손가락(터치) · 마우스로 누른 뒤 빨간 초점 테두리가 없다(:focus-visible 아님 · outline 없음) — 캡처로도 남긴다
   ③ 마지막 장에서 오른쪽 단추가 «처음 포스터로»(되돌리기 그림)로 바뀌고, 누르면 줄이 맨 앞까지 넘어간다 —
      50ms마다 줄 위치를 재서 지나간 장 수 · 걸린 시간을 적고, 끝에 1번이 골라져 있어야 한다
   ④ «내 휴대폰에 저장»: 아이폰은 공유(PNG 파일 1개)를 부르고 내려받지 않으며 «공유 창에서 ‘이미지 저장’을 누르세요» 한 줄이 보인다.
      갤럭시 · PC는 공유를 부르지 않고 «Poster Studio_….png»를 바로 내려받는다(이름 · 크기를 적는다), 안내 줄 없음.
      공유는 페이지 안에서 가로채 적기만 한다(진짜 공유 창 · 사진첩 저장은 실기기에서만 보인다 — 실기기 확인 필요).
   캡처(원본 해상도 PNG)는 <결과 폴더>/<기기>-<장면>.png, 기록은 report.json. 카메라 · 인쇄 · AI 서버는 막는다(생성 0). */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const url = args[0] || 'http://127.0.0.1:5500/';
const out = path.resolve(args[1] || path.join(os.tmpdir(), 'phone-step3-probe'));
const devices = [
  { name: '아이폰', w: 390, h: 664, dpr: 3, touch: true, expect: 'share', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' },
  { name: '갤럭시', w: 360, h: 740, dpr: 3, touch: true, expect: 'download', ua: 'Mozilla/5.0 (Linux; Android 15; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36' },
  { name: 'PC좁은창', w: 390, h: 664, dpr: 1, touch: false, expect: 'download', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
];
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));
await fs.mkdir(out, { recursive: true });
const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'step3-dl-'));
const report = [];
const fails = [];
let port = 9611;
for (const d of devices) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'step3-chrome-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--mute-audio', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket, seq = 0;
  const pending = new Map();
  const downloads = [];
  const problems = [];
  const row = { device: d.name, size: `${d.w}x${d.h}@${d.dpr}`, userAgent: d.ua };
  try {
    let target;
    for (let i = 0; i < 50; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); if (target) break; } catch { /* 아직 안 떴다 */ } await delay(100); }
    assert.ok(target, '브라우저 시작');
    socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
    const call = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    socket.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result); return; }
      if (m.method === 'Page.downloadWillBegin') downloads.push({ guid: m.params.guid, name: m.params.suggestedFilename, bytes: null, state: 'started' });
      if (m.method === 'Page.downloadProgress') { const x = downloads.find((y) => y.guid === m.params.guid); if (x && m.params.state === 'completed') Object.assign(x, { bytes: m.params.totalBytes, state: 'completed' }); }
    };
    const evaluate = async (expression) => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return r.result.value; };
    const capture = async (name) => { const s = await call('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(out, `${d.name}-${name}.png`), Buffer.from(s.data, 'base64')); };
    // 손가락은 터치 사건, PC는 마우스 사건 — 둘 다 사람이 누른 것과 같은 입력이다.
    const press = async (selector) => {
      const b = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (d.touch) {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
        for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
      }
    };
    await call('Network.enable');
    await call('Network.setBlockedURLs', { urls: url.startsWith('https://') ? ['https://*.cloudfunctions.net/*'] : ['https://*'] });
    await call('Page.enable');
    await call('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    await call('Emulation.setUserAgentOverride', { userAgent: d.ua });
    await call('Emulation.setDeviceMetricsOverride', { width: d.w, height: d.h, deviceScaleFactor: d.dpr, mobile: d.touch });
    await call('Emulation.setTouchEmulationEnabled', d.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    // 공유는 가로채 적기만 한다(이 컴퓨터의 윈도 공유 창을 띄우지 않게). 카메라 · 인쇄 막기, 알림 숨기기.
    await call('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__shares = [];
      navigator.canShare = () => true;
      navigator.share = async (data) => { window.__shares.push((data.files || []).map((f) => ({ name: f.name, type: f.type, size: f.size }))); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw Error('확인 중 카메라 차단'); };
      window.print = () => { throw Error('확인 중 인쇄 차단'); };
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.studio-status{display:none!important}'; document.head.append(s); });` });
    await call('Page.navigate', { url });
    for (let i = 0; i < 150; i++) { if (await evaluate('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")')) break; await delay(100); }
    await evaluate("document.getElementById('prepareNextBtn').click(), true"); await delay(600);
    await evaluate("document.getElementById('shotBtn').click(), true");
    let ready = false;
    for (let i = 0; i < 700; i++) { if (await evaluate("document.body.dataset.step === '3' && !document.getElementById('spinner') && document.querySelectorAll('.poster-slide').length > 1")) { ready = true; break; } await delay(100); }
    assert.ok(ready, `${d.name}: 3단계에 닿지 않음`);
    await delay(2200);   // 완성 알림 · 움찔 안내가 지나가게
    const state = () => evaluate(`(() => { const c = document.querySelector('.poster-carousel-caption'); const n = document.querySelector('.carousel-arrow.next');
      const cs = n ? getComputedStyle(n) : null; const cur = [...document.querySelectorAll('.poster-slide')].findIndex((s) => s.getAttribute('aria-current'));
      return { caption: c ? c.textContent : null, selected: cur, nextLabel: n && n.getAttribute('aria-label'), rewind: !!(n && n.dataset.rewind), nextDisabled: !!(n && n.disabled),
        focusVisible: !!(n && n.matches(':focus-visible')), outline: cs ? cs.outlineStyle + ' ' + cs.outlineWidth : null, active: document.activeElement && (document.activeElement.className || document.activeElement.tagName) }; })()`);
    const first = await state();
    row.caption = first.caption;
    if (!first.caption || !/^[A-Za-z][A-Za-z ]+$/.test(first.caption)) problems.push(`이름이 영어가 아님: «${first.caption}»`);
    await capture('1-처음');
    await press('.carousel-arrow.next'); await delay(700);
    const afterPress = await state();
    row.afterPress = afterPress;
    if (afterPress.selected !== 1) problems.push(`› 를 눌러도 2번으로 안 감(${afterPress.selected})`);
    if (afterPress.focusVisible || !/^none/.test(afterPress.outline)) problems.push(`누른 뒤 초점 테두리: ${afterPress.outline} · focus-visible ${afterPress.focusVisible}`);
    await capture('2-누른뒤');
    const n = await evaluate("document.querySelectorAll('.poster-slide').length");
    for (let i = afterPress.selected; i < n - 1; i++) { await press('.carousel-arrow.next'); await delay(650); }
    const last = await state();
    row.last = last;
    if (last.selected !== n - 1) problems.push(`마지막 장까지 못 감(${last.selected}/${n - 1})`);
    if (!last.rewind || last.nextLabel !== '처음 포스터로' || last.nextDisabled) problems.push(`마지막 장 오른쪽 단추: ${last.nextLabel} · 되돌리기 ${last.rewind} · 누를 수 없음 ${last.nextDisabled}`);
    if (last.focusVisible || !/^none/.test(last.outline)) problems.push(`마지막 장에서 초점 테두리: ${last.outline}`);
    await capture('3-마지막장');
    // 되돌리기: 50ms마다 줄 위치를 잰다
    await evaluate(`(() => { window.__trail = []; const c = document.querySelector('.poster-carousel'); const t0 = performance.now();
      const id = setInterval(() => { window.__trail.push([Math.round(performance.now() - t0), Math.round(c.scrollLeft)]); if (performance.now() - t0 > 2000) clearInterval(id); }, 50); return true; })()`);
    await press('.carousel-arrow.next'); await delay(2100);
    const trail = await evaluate('window.__trail');
    const step = await evaluate("(() => { const s = document.querySelectorAll('.poster-slide'); return s[1].offsetLeft - s[0].offsetLeft; })()");
    const startLeft = trail[0][1];
    const settle = trail.find(([, left]) => left <= 2);
    const passed = new Set(trail.map(([, left]) => Math.round(left / step))).size;
    const back = await state();
    row.rewind = { startLeft, step, ms: settle ? settle[0] : null, slidesPassed: passed, selected: back.selected, caption: back.caption };
    if (!settle) problems.push('되돌리기 뒤 2초 안에 맨 앞에 닿지 않음');
    if (back.selected !== 0) problems.push(`되돌리기 뒤 고른 장 ${back.selected}(0이어야 함)`);
    await capture('4-되돌린뒤');
    // 저장
    await press('#saveBtn'); await delay(500);
    const hint = await evaluate("(() => { const h = document.querySelector('.save-hint'); return h ? h.textContent : null; })()");
    await capture('5-저장누름');
    await delay(1800);
    const shares = await evaluate('window.__shares');
    row.save = { shares, downloads: downloads.map(({ name, bytes, state: s }) => ({ name, bytes, state: s })), hint };
    if (d.expect === 'share') {
      if (shares.length !== 1 || shares[0].length !== 1 || shares[0][0].type !== 'image/png' || !/^Poster Studio_.+\.png$/.test(shares[0][0].name) || !(shares[0][0].size > 0)) problems.push(`공유 기록 다름: ${JSON.stringify(shares)}`);
      if (downloads.length) problems.push(`아이폰인데 내려받음 ${downloads.length}개`);
      if (hint !== '공유 창에서 ‘이미지 저장’을 누르세요') problems.push(`안내 줄: ${hint}`);
    } else {
      if (shares.length) problems.push(`공유를 불렀음 ${shares.length}번`);
      if (downloads.length !== 1 || !/^Poster Studio_.+\.png$/.test(downloads[0].name) || !(downloads[0].bytes > 0)) problems.push(`내려받기 기록 다름: ${JSON.stringify(row.save.downloads)}`);
      if (hint !== null) problems.push(`안내 줄이 보임: ${hint}`);
    }
  } catch (error) {
    problems.push(`멈춤: ${error.message}`);
  } finally { socket?.close(); chrome.kill(); await delay(500); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); port++; }
  row.problems = problems;
  report.push(row);
  const s = row.save || {};
  console.log(`${d.name}: 이름 «${row.caption}» · 누른 뒤 테두리 ${row.afterPress ? row.afterPress.outline : '?'} · 마지막 장 «${row.last ? row.last.nextLabel : '?'}» · 되돌리기 ${row.rewind ? `${row.rewind.ms}ms에 맨 앞, ${row.rewind.slidesPassed}장 지나감` : '?'} · 저장 ${s.shares && s.shares.length ? '공유 ' + JSON.stringify(s.shares[0]) : ''}${s.downloads && s.downloads.length ? '내려받기 ' + JSON.stringify(s.downloads) : ''} · 안내 ${s.hint ?? '없음'}${problems.length ? '  ← ' + problems.join(' / ') : ''}`);
  if (problems.length) fails.push(`${d.name}: ${problems.join(' / ')}`);
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
await fs.rm(downloadDir, { recursive: true, force: true }).catch(() => {});
console.log(fails.length ? `실패 ${fails.length}건\n${fails.join('\n')}` : '통과 — 세 기기 모두 이름 · 테두리 · 되돌리기 · 저장이 기대대로');
process.exit(fails.length ? 1 : 0);

/* «움직임 줄이기»(prefers-reduced-motion: reduce)를 보고하는 브라우저에서도 스플래시 · 촬영 예시 영상 · 로딩 화면이 멈추지 않는지 본다
   (2026-11-11 Bumm님 «가. 늘 돌게 하기», 팀장 전달 — 원격으로 연 이 PC의 크롬이 그 신호를 보고해 세 가지가 멈춰 있었다).

     node scripts/verify/reduced-motion-probe.mjs <주소> <결과 폴더> --playwright <playwright-core가 든 node_modules의 부모 폴더> [--motion both|reduce|no-preference] [--size 1366x768] [--shots]

   playwright-core는 저장소 의존성이 아니다 — 임시 폴더에 설치해 넘긴다(11/11은 1.64.0). 브라우저는 이 PC의 크롬(channel chrome)이다 —
   Playwright 크로미움은 H.264를 못 풀 수 있어 영상 판정이 거짓이 된다. 조건마다 page.emulateMedia({ reducedMotion })로 연다.
   판정(하나라도 어긋나면 종료코드 1, 조건마다):
   ⓪ 페이지의 matchMedia('(prefers-reduced-motion: reduce)')가 그 조건과 같다(흉내가 실제로 걸렸는지 — 빈 게이트 막기)
   ① 스플래시 막대(#splash .sbar i)의 애니메이션이 splashBar · running이고, 막대 자리(transform)가 실제로 바뀐다
   ② 개인 · 단체 촬영 예시 영상이 목록(camera-videos.json)의 주소로 재생되고 currentTime이 1.5초 동안 실제로 는다
   ③ «샘플 포스터 보기» 로딩 화면: 대기 영상 currentTime이 늘고, 점 애니메이션이 running이고, 8초 뒤 다음 장면으로 넘어간다
   카메라 · 인쇄는 막고, 로컬 주소면 https 전부 · 라이브면 AI 서버만 막는다(생성 요청 0 — 샘플 흐름은 서버에 아무것도 보내지 않는다).
   --shots면 스플래시 · 개인 · 단체 재생 중 화면을 원본 해상도 PNG로 남긴다.
   --force면 흉내(emulateMedia) 대신 크롬을 --force-prefers-reduced-motion으로 띄운다 — 브라우저 설정 자체가 reduce인 상태(원격으로 연 PC처럼)로, reduce 조건만 잰다. */
/* global document, window, getComputedStyle, matchMedia, navigator */
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const valued = ['--playwright', '--motion', '--size'];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && !valued.includes(args[i - 1]));
const [url, outDir] = positional;
const pwDir = opt('--playwright');
if (!url || !outDir || !pwDir) { console.error('사용법: <주소> <결과 폴더> --playwright <폴더> [--motion both|reduce|no-preference] [--size 1366x768] [--shots]'); process.exit(2); }
const motions = opt('--motion', 'both') === 'both' ? ['reduce', 'no-preference'] : [opt('--motion')];
const [vw, vhRaw] = opt('--size', '1366x768').split('@')[0].split('x').map(Number);
const dpr = Number(opt('--size', '').split('@')[1] || 1);
const shots = args.includes('--shots');
const force = args.includes('--force');
if (force) motions.splice(0, motions.length, 'reduce');
await fs.mkdir(outDir, { recursive: true });
const videos = JSON.parse(fss.readFileSync('src/studio/camera-videos.json', 'utf8'));
const srcOf = (mode) => videos.find((e) => e.mode === mode && e.status === 'approved')?.src;

const { chromium } = await import(pathToFileURL(path.join(pwDir, 'node_modules/playwright-core/index.js')).href).then((m) => m.default ?? m);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required', ...(force ? ['--force-prefers-reduced-motion'] : [])] });
const failures = [];
const report = [];
const check = (ok, name, detail) => { console.log(`${ok ? '통과' : '실패'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`); report.push({ ok, name, detail }); if (!ok) failures.push(name); };
const sleep = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

async function open(motion) {
  const context = await browser.newContext({ viewport: { width: vw, height: vhRaw }, deviceScaleFactor: dpr, hasTouch: vw < 768, isMobile: vw < 768, reducedMotion: force ? null : motion });
  const page = await context.newPage();
  await page.route(url.startsWith('https://') ? /cloudfunctions\.net/ : /^https:/, (route) => route.abort());
  await page.addInitScript(() => {
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw Error('확인 중 카메라 차단'); };
    window.print = () => { throw Error('확인 중 인쇄 차단'); };
  });
  return { context, page };
}

async function toStep2(page, mode) {
  await page.goto(url);
  await page.waitForFunction(() => !!document.getElementById('prepareNextBtn') && !document.getElementById('splash'), null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await page.click(`[data-mode="${mode}"]`);
  await sleep(200);
  await page.click('#prepareNextBtn');
}

for (const motion of motions) {
  const tag = motion === 'reduce' ? '줄이기' : '보통';
  // ⓪ + ① 스플래시
  {
    const { context, page } = await open(motion);
    await page.goto(url, { waitUntil: 'commit' });
    const seen = { running: false, names: new Set(), transforms: new Set(), reduce: null, shot: false };
    const until = Date.now() + 8_000;
    while (Date.now() < until) {
      const s = await page.evaluate(() => {
        const bar = document.querySelector('#splash .sbar i');
        if (!bar) return { gone: !!document.getElementById('prepareNextBtn') && !document.getElementById('splash'), reduce: matchMedia('(prefers-reduced-motion: reduce)').matches };
        const waiting = document.documentElement.classList.contains('splash-fonts-wait');
        return { reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, waiting, name: getComputedStyle(bar).animationName,
          running: bar.getAnimations().some((a) => a.playState === 'running'), transform: getComputedStyle(bar).transform };
      }).catch(() => null);
      if (s) {
        seen.reduce = s.reduce;
        if (s.gone) break;
        if (s.name !== undefined && !s.waiting) {
          seen.names.add(s.name); if (s.running) seen.running = true; seen.transforms.add(s.transform);
          if (shots && !seen.shot && seen.transforms.size >= 2) { seen.shot = true; await page.screenshot({ path: path.join(outDir, `${tag}-스플래시.png`) }); }
        }
      }
      await sleep(40);
    }
    check(seen.reduce === (motion === 'reduce'), `${tag}: 페이지가 «움직임 줄이기 = ${motion === 'reduce'}»로 본다`, seen.reduce);
    check(seen.names.has('splashBar') && seen.running, `${tag}: 스플래시 막대 애니메이션이 running`, [...seen.names]);
    check(seen.transforms.size >= 3, `${tag}: 스플래시 막대가 실제로 움직인다(자리 ${seen.transforms.size}가지)`);
    await context.close();
  }
  // ② 촬영 예시 영상(개인 · 단체)
  for (const mode of ['solo', 'group']) {
    const { context, page } = await open(motion);
    await toStep2(page, mode);
    const read = () => page.evaluate(() => {
      const v = document.querySelector('.cameraBox .camera-example-video');
      return v && { src: v.getAttribute('src'), t: v.currentTime, paused: v.paused, active: v.dataset.active, ready: v.readyState };
    });
    let a = null;
    for (let i = 0; i < 80; i++) { a = await read(); if (a && !a.paused && a.active === 'true' && a.t > 0) break; await sleep(100); }
    await sleep(1500);
    const b = await read();
    check(Boolean(a && a.src === srcOf(mode)), `${tag}: ${mode} 예시 영상 요소가 목록 주소로 있다`, a && a.src);
    check(Boolean(a && b && !b.paused && b.t > a.t + 0.8), `${tag}: ${mode} 예시 영상 currentTime이 는다`, a && b && [a.t, b.t]);
    if (shots) {
      for (let i = 0; i < 60; i++) { const c = await read(); if (!c || c.t >= 5.2) break; await sleep(100); }
      await page.locator('.cameraBox').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(outDir, `${tag}-${mode === 'group' ? '단체' : '개인'}-재생중.png`) });
    }
    await context.close();
  }
  // ③ 로딩 화면(샘플 포스터 보기)
  {
    const { context, page } = await open(motion);
    await toStep2(page, 'solo');
    await sleep(500);
    // 샘플 흐름은 휴대폰도 아래 «샘플 포스터 보기»(#shotBtn)다 — 원형 단추(#phoneShotBtn)는 카메라를 켠다(두 단추 판, 10/20).
    await page.click('#shotBtn');
    await page.waitForSelector('#spinner[open]', { timeout: 10_000 });
    const read = () => page.evaluate(() => {
      const d = document.getElementById('spinner'); if (!d) return null;
      const v = d.querySelector('video[data-active="true"]') || d.querySelector('video');
      const dot = d.querySelector('.generation-dots i');
      return { scene: d.dataset.scene, paused: d.dataset.paused, video: v && { t: v.currentTime, paused: v.paused }, dot: dot && dot.getAnimations().some((x) => x.playState === 'running') };
    });
    let a = null;
    for (let i = 0; i < 60; i++) { a = await read(); if (a && a.video && a.video.t > 0) break; await sleep(100); }
    await sleep(1500);
    const b = await read();
    check(Boolean(a && b && b.video && !b.video.paused && b.video.t > (a.video ? a.video.t : 0) + 0.8), `${tag}: 로딩 화면 대기 영상 currentTime이 는다`, a && b && [a.video, b.video]);
    check(Boolean(b && b.dot), `${tag}: 로딩 화면 점 애니메이션이 running`);
    let c = b;
    for (let i = 0; i < 100 && c && c.scene === '0'; i++) { await sleep(100); c = await read(); }
    check(Boolean(c && c.scene !== '0'), `${tag}: 로딩 화면이 다음 장면으로 넘어간다`, c && c.scene);
    await context.close();
  }
}
await browser.close();
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
console.log(failures.length ? `실패 ${failures.length}건` : `통과 — ${report.length}건`);
process.exit(failures.length ? 1 : 0);

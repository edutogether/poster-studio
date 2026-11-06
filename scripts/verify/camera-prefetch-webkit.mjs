/* 1단계 예시 영상 미리 준비가 아이폰과 같은 엔진(WebKit)에서 깨지지 않는지 본다(2026-11-07 Bumm님 «넘기면 처음에 좀 딜레이되었다 시작», 팀장 전달).

     node scripts/verify/camera-prefetch-webkit.mjs <주소> <결과 폴더> --playwright <playwright-core가 든 node_modules의 부모 폴더> [--dwell 8000]

   playwright-core는 저장소 의존성이 아니다 — 임시 폴더에 설치해 넘긴다(설치된 WebKit과 맞는 판, 11/7은 1.62.1 · webkit-2336).
   판정(하나라도 어긋나면 종료코드 1):
   ① 1단계에서 영상 요소가 있고 멈춰 있다(paused · currentTime 0) ② 2단계로 넘어가도 같은 요소다
   ③ 넘어간 뒤 재생을 시도한다(재생 중이거나, 이 빌드가 코덱을 못 풀어 오류면 정지 그림으로 내려간다 — 빈 칸이면 실패)
   ④ 1단계로 돌아오면 멈추고 처음으로 되감는다.
   ⚠ 윈도용 WebKit 빌드이고 실제 아이폰이 아니다. iOS 사파리가 미리 받기 양을 어떻게 정하는지 · 소리 자동 재생 허용은 이 도구로 알 수 없다.
   https는 막고(로컬 주소 전용) 카메라 · 인쇄 · 생성 요청은 없다. */
/* global document, window, setTimeout -- page.evaluate 안에서 쓴다 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const positional = args.filter((a, i) => !a.startsWith('--') && !['--playwright', '--dwell'].includes(args[i - 1]));
const [url, outDir] = positional;
const pwDir = opt('--playwright');
const dwell = Number(opt('--dwell', 8000));
if (!url || !outDir || !pwDir) { console.error('사용법: <주소> <결과 폴더> --playwright <폴더>'); process.exit(2); }
await fs.mkdir(outDir, { recursive: true });

const { webkit } = await import(pathToFileURL(path.join(pwDir, 'node_modules/playwright-core/index.js')).href).then((m) => m.default ?? m);
const browser = await webkit.launch();
const failures = [];
const check = (ok, name, detail) => { console.log(`${ok ? '통과' : '실패'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`); if (!ok) failures.push(name); };
const state = `(() => { const v = document.querySelector('.camera-example-video'); if (!v) return null;
  return { src: v.getAttribute('src'), paused: v.paused, time: v.currentTime, muted: v.muted, ready: v.readyState, net: v.networkState, error: v.error && v.error.code, active: v.dataset.active }; })()`;

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.route(/^https:/, (route) => route.abort());
await page.goto(url);
await page.waitForFunction(() => !!document.getElementById('prepareNextBtn') && !document.getElementById('splash'), null, { timeout: 60_000 });
await page.evaluate(() => { window.__marked = document.querySelector('.camera-example-video'); });
await page.waitForTimeout(dwell);

const step1 = await page.evaluate(state);
check(Boolean(step1), '① 1단계에 영상 요소가 있다', step1);
check(step1?.paused === true && step1?.time === 0, '① 1단계에서 재생하지 않는다');
await page.screenshot({ path: path.join(outDir, 'step1.png') });

await page.locator('#prepareNextBtn').click();
await page.waitForTimeout(1500);
check(await page.evaluate(() => document.querySelector('.camera-example-video') === window.__marked), '② 2단계에서 같은 요소다');
const step2 = await page.evaluate(state);
const moved = await page.evaluate(() => new Promise((done) => { const v = document.querySelector('.camera-example-video'); if (!v) { done(null); return; } const a = v.currentTime; setTimeout(() => done(v.currentTime - a), 800); }));
const still = await page.evaluate(() => { const i = document.querySelector('.camera-example-still'); return i ? { active: i.dataset.active, src: i.getAttribute('src'), natural: i.naturalWidth } : null; });
const playing = step2 && !step2.paused && moved > 0.2;
const fellBack = (!step2 || step2.error) && still?.active === 'true' && still.natural > 0;
check(playing || fellBack, playing ? '③ 2단계에서 재생한다' : '③ 코덱 오류라 정지 그림으로 내려간다', { step2, moved, still });
await page.screenshot({ path: path.join(outDir, 'step2.png') });

if (playing) {
  await page.getByRole('button', { name: '이전' }).first().click();
  await page.waitForTimeout(500);
  const back = await page.evaluate(state);
  check(back?.paused === true && back?.time === 0, '④ 1단계로 돌아오면 멈추고 처음으로 되감는다', back);
}
check(errors.length === 0, '페이지 오류 없음', errors);
await browser.close();
console.log(failures.length ? `실패 ${failures.length}건` : '모두 통과');
process.exit(failures.length ? 1 : 0);

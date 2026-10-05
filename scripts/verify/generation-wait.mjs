/* 헤드리스 실제 빌드 확인. 카메라는 캔버스 스트림, AI는 고정 응답이며
   네트워크 계층에서도 모든 외부 주소를 차단한다. 실제 과금·촬영·인쇄는 없다.
   node scripts/verify/generation-wait.mjs [--selftest: 원화 차단으로 검사가 실패하는지 확인] */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const selfTest = process.argv.includes("--selftest");
const out = process.env.VERIFY_OUTPUT_DIR ? path.resolve(process.env.VERIFY_OUTPUT_DIR) : path.join(root, ".cache", "wait-v2-verification");
await fs.mkdir(out, { recursive: true });
const headers = JSON.parse(await fs.readFile("firebase.json", "utf8")).hosting
  .headers[0].headers;
const roots = [path.resolve("dist")];
const servers = [];
const mime = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
};
for (let i = 0; i < roots.length; i++) {
  const server = http.createServer(async (req, res) => {
    const name = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = path.resolve(
      roots[i],
      "." + (name === "/" ? "/index.html" : name),
    );
    if (!file.startsWith(roots[i] + path.sep) || req.method !== "GET")
      return res.writeHead(404).end();
    try {
      const bytes = await fs.readFile(file);
      for (const { key, value } of headers) res.setHeader(key, value);
      res.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(5543 + i, "127.0.0.1", resolve));
  servers.push(server);
}
const chrome = spawn(
  process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--autoplay-policy=no-user-gesture-required",
    "--remote-debugging-port=9533",
    `--user-data-dir=${path.join(out, "chrome")}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
let socket,
  next = 0;
const pending = new Map(),
  errors = [],
  network = [];
const wait = (ms) =>
  new Promise((resolve) => globalThis.setTimeout(resolve, ms));
try {
  let target;
  for (let i = 0; i < 50; i++) {
    try {
      target = (await (await fetch("http://127.0.0.1:9533/json")).json()).find(
        (t) => t.type === "page",
      );
      if (target) break;
    } catch {}
    await wait(200);
  }
  assert.ok(target, "헤드리스 브라우저 시작");
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails);
    if (m.method === "Network.requestWillBeSent")
      network.push(m.params.request.url);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setBlockedURLs", {
    urls: ["https://*", "http://*.cloudfunctions.net/*", ...(selfTest ? ["*/waiting-approved-v1/*"] : [])],
  });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `
    const originalFetch=window.fetch;
    window.fetch=(url,options)=>{
      if(String(url).endsWith('/health'))return Promise.resolve(new Response(JSON.stringify({openaiReachable:true}),{status:200}));
      if(new URL(String(url),location.href).origin!==location.origin)throw new Error('검증 중 외부 호출 차단');
      return originalFetch(url,options);
    };
    window.print=()=>{window.__printCalls=(window.__printCalls||0)+1;};
  `,
  });
  const load = async (port, width = 1366, height = 768) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await send("Page.navigate", { url: `http://127.0.0.1:${port}/` });
    for (let i = 0; i < 60; i++) {
      await wait(100);
      if (await evaluate(`!!document.getElementById('generateBtn')`)) break;
    }
    await evaluate("document.fonts.ready");
    await wait(3300);
  };
  const screenshot = async (name) => {
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await fs.writeFile(
      path.join(out, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  const layouts=[];
  for (const [width,height] of [[1920,1080],[1366,768],[390,844]]) {
    await load(5543,width,height);
    // 현재 3단계 화면을 통해 진입한다. 삭제된 resetBtn에 의존하는 옛 포스터 대조 픽스처는 사용하지 않는다.
    await evaluate(`(()=>{
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=960;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#e9b949';ctx.fillRect(0,0,1280,960);
      window.__cameraFrames=setInterval(()=>ctx.fillRect(0,0,1280,960),33);
      navigator.mediaDevices.getUserMedia=async()=>canvas.captureStream(30);
      const original=window.fetch;
      window.fetch=async(url,options)=>{
        if(String(url).includes('/generate')){
          await new Promise(resolve=>{window.__releaseWait=resolve;});
          return new Response(JSON.stringify({images:[canvas.toDataURL('image/png')]}),{status:200,headers:{'content-type':'application/json'}});
        }
        return original(url,options);
      };
      document.getElementById('prepareNextBtn').click();
    })()`);
    await wait(150);
    await evaluate("document.getElementById('startBtn').click()");
    for(let i=0;i<60;i++){await wait(100);if(await evaluate("document.getElementById('video').videoWidth>0"))break;}
    assert.ok(await evaluate("document.getElementById('video').videoWidth>0"), '모의 카메라 프레임 준비');
    await evaluate("document.getElementById('shotBtn').click()");
    for(let i=0;i<80;i++){await wait(100);if(await evaluate("!document.getElementById('generateBtn').hidden"))break;}
    assert.equal(await evaluate("document.getElementById('generateBtn').hidden"),false,'촬영 후 상태 도달');
    await evaluate("document.getElementById('generateBtn').click()");
    for(let i=0;i<150;i++){await wait(100);if(await evaluate("!!document.getElementById('spinner')"))break;}
    await wait(1000);
    assert.ok(await evaluate("!!document.querySelector('.movie-fact')"), await evaluate("JSON.stringify({body:document.body.innerText.slice(-2000),video:document.getElementById('video').videoWidth})"));
    const info=await evaluate(`(()=>{const d=document.getElementById('spinner');const b=document.querySelector('.movie-fact').getBoundingClientRect();const v=document.querySelector('.generation-robot-film[data-active=true]');return {open:d.open,width:d.scrollWidth,clientWidth:d.clientWidth,factBottom:b.bottom,height:innerHeight,imageWidth:v.naturalWidth,image:v.getAttribute("src"),paused:d.dataset.paused,headline:document.querySelector('#generationTitle [data-active=true]').textContent,fact:document.querySelector('.movie-fact h2[data-active=true]').textContent}})()`);
    assert.equal(info.open,true);
    assert.ok(info.width<=info.clientWidth);
    assert.ok(info.factBottom<=height, JSON.stringify(info));
    assert.ok(info.imageWidth>0, '확정 로봇 원화 로딩');
    assert.equal(info.paused,'false', '세트 자동 넘김');
    assert.equal(await evaluate(`document.querySelectorAll('.movie-quiz-options').length`),0);
    await screenshot(`waiting-${width}`);
    if(width===1366){
      await wait(12500);
      const later=await evaluate(`({headline:document.querySelector('#generationTitle [data-active=true]').textContent,fact:document.querySelector('.movie-fact h2[data-active=true]').textContent,image:document.querySelector('.generation-robot-film[data-active=true]').getAttribute('src')})`);
      assert.notEqual(later.headline,info.headline);
      assert.notEqual(later.fact,info.fact);
      assert.notEqual(later.image,info.image);
      await screenshot(`next-fact-${width}`);
      // 로딩 화면은 멈추는 화면이 아니다(2026-10-06 Bumm님 결정 118) — 멈춤 단추가 없고 넘김이 계속된다
      assert.equal(await evaluate(`document.querySelector('.generation-pause')`),null,'멈춤 단추 없음');
      assert.equal(await evaluate(`document.getElementById('spinner').dataset.paused`),'false');
    }
    await evaluate('window.__releaseWait()');
    for(let i=0;i<100;i++){await wait(100);if(await evaluate("!!document.querySelector('.completion-notice')"))break;}
    // fixed 위치의 50%는 스크롤바를 제외한 레이아웃 뷰포트 기준이다.
    const completed=await evaluate(`(()=>{const el=document.querySelector('.completion-notice');if(!el)return null;const r=el.getBoundingClientRect();return {title:el.querySelector('strong').textContent,body:el.querySelector('p').textContent,x:r.x+r.width/2,y:r.y+r.height/2,w:document.documentElement.clientWidth,h:document.documentElement.clientHeight}})()`);
    assert.ok(completed, '완료 알림 표시');
    assert.equal(completed.title,'완성 !');
    assert.equal(completed.body,'마음에 드는 버전을 고르고 인쇄하세요.');
    await screenshot(`completed-${width}`);
    assert.ok(Math.abs(completed.x-completed.w/2)<2 && Math.abs(completed.y-completed.h/2)<2,'화면 가운데 알림: '+JSON.stringify(completed));
    if(width===1366){
      await wait(2300);
      assert.equal(await evaluate(`!!document.querySelector('.completion-notice')`),false);
    }else{
      await evaluate(`document.querySelector('.stepper button').click()`);
      assert.equal(await evaluate(`!!document.querySelector('.completion-notice')`),false);
      await evaluate(`document.querySelectorAll('.stepper button')[2].click()`);
      assert.equal(await evaluate(`!!document.querySelector('.completion-notice')`),false);
    }
    layouts.push(info);
  }
  assert.equal(errors.length,0);
  assert.equal(network.filter(u=>/cloudfunctions\.net|run\.app|api\.openai/.test(u)).length,0);
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(layouts,null,2));
  console.log(JSON.stringify({layouts:layouts.length,errors:errors.length,actualApiRequests:0}));
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill();
  for (const server of servers) server.close();
}

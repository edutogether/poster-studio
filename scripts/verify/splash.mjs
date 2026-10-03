/* 스플래시 실제 빌드 확인. 외부 요청은 차단한다.
   node scripts/verify/splash.mjs
   --selftest는 이모지 이미지를 차단하므로 반드시 실패해야 한다. */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const selftest = process.argv.includes("--selftest");
const out = path.join(root, ".cache", "splash-verification");
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
  await new Promise((resolve) => server.listen(5530 + i, "127.0.0.1", resolve));
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
    "--remote-debugging-port=9531",
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
      target = (await (await fetch("http://127.0.0.1:9531/json")).json()).find(
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
    urls: ["https://*", "http://*.cloudfunctions.net/*", ...(selftest ? ["*/clapperboard-apple.png"] : [])],
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
      if (await evaluate(`!!document.getElementById('modeSeg')`)) break;
    }
    await evaluate("document.fonts.ready");
    await wait(800);
  };
  const screenshot = async (name) => {
    const shot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await fs.writeFile(
      path.join(out, name + ".png"),
      Buffer.from(shot.data, "base64"),
    );
  };
  const reports=[];
  for (const [width,height,reduced] of [[1920,1200,false],[1366,768,false],[390,844,false],[390,844,true]]) {
    await send("Emulation.setEmulatedMedia", {features:[{name:"prefers-reduced-motion",value:reduced ? "reduce" : "no-preference"}]});
    await load(5530,width,height);
    const state=await evaluate(`(()=>{const s=document.getElementById('splash');const n=s.querySelector('.name');const a=n.querySelector('.splash-accent');const logo=s.querySelector('.logo');const img=logo.querySelector('img');const bar=getComputedStyle(s.querySelector('.sbar i'));const timing=s.getAnimations()[0].effect.getTiming();return {background:getComputedStyle(s).backgroundColor,name:n.textContent,nameColor:getComputedStyle(n).color,accent:a.textContent,accentColor:getComputedStyle(a).color,duration:timing.duration,delay:timing.delay,barDuration:bar.animationDuration,barEase:bar.animationTimingFunction,logoAnimation:getComputedStyle(logo).animationName,logoDuration:getComputedStyle(logo).animationDuration,imageLoaded:img.complete&&img.naturalWidth===160,imagePath:new URL(img.currentSrc || img.src, location.href).pathname,width:document.documentElement.scrollWidth}})()`);
    assert.equal(state.background,'rgb(255, 255, 255)');
    assert.equal(state.name,'InKY Poster Studio');
    assert.equal(state.accent,'Studio');
    assert.equal(state.accentColor,'rgb(237, 49, 36)');
    // Bumm님 요청으로 Voice Cinema와 같은 2300ms 유지 + 600ms 페이드로 맞췄다.
    assert.equal(state.duration,600);
    assert.equal(state.delay,2300);
    assert.equal(state.barDuration,reduced ? '0s' : '1.15s');
    assert.equal(state.logoDuration,reduced ? '0s' : '0.6s');
    assert.equal(state.logoAnimation,reduced ? 'none' : 'splashPop');
    if (!reduced) assert.equal(state.barEase,'linear');
    assert.equal(state.imageLoaded,true,'Apple 이모지 PNG 로드');
    assert.equal(state.imagePath,'/studio/clapperboard-apple.png');
    const education=await evaluate(`(()=>{const img=document.querySelector('#splash .splash-education-logo');const r=img.getBoundingClientRect();const copy=document.querySelector('#splash .stagline').getBoundingClientRect();const bar=document.querySelector('#splash .sbar').getBoundingClientRect();return {loaded:img.complete&&img.naturalWidth>0,barBelowCopy:bar.top>=copy.bottom,belowBar:r.top>=bar.bottom,center:Math.abs(r.x+r.width/2-document.documentElement.clientWidth/2)}})()`);
    assert.ok(education.loaded&&education.barBelowCopy&&education.belowBar&&education.center<1,'교육청 로고는 문구와 로딩바 아래 중앙에 표시');
    assert.ok(state.width<=width);
    await screenshot(`splash-${width}${reduced ? '-reduce' : ''}`);
    await wait(2600);
    assert.equal(await evaluate(`document.getElementById('splash')===null`),true);
    reports.push({width,height,reduced,...state,removed:true});
  }
  assert.equal(errors.length,0);
  assert.equal(network.filter(u=>/cloudfunctions\.net|run\.app|api\.openai/.test(u)).length,0);
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({viewports:reports.length,exit:'정상 표시 후 제거',apiRequests:0}));
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill();
  for (const server of servers) server.close();
}

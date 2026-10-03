/* 촬영 전후 하단의 좌표와 실제 PNG 픽셀을 비교한다.
   가짜 캔버스 카메라만 사용하며 모든 외부 요청과 인쇄를 차단한다.
   node scripts/verify/camera-review-comparison.mjs
   --selftest: 포스터를 1px 이동시켜 종료 코드 1로 실패하는지 확인한다. */
import fs from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const selfTest = process.argv.includes("--selftest");
const out = path.join(root, ".cache", selfTest ? "camera-review-comparison-selftest" : "camera-review-comparison");
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
  await new Promise((resolve) => server.listen(5546 + i, "127.0.0.1", resolve));
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
    "--remote-debugging-port=9536",
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
      target = (await (await fetch("http://127.0.0.1:9536/json")).json()).find(
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
    urls: ["https://*", "http://*.cloudfunctions.net/*", ],
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

  const rows=[];
  const selectors=['.camera-film-heading','.camera-film-poster','.camera-ticket','.camera-actions'];
  const measure=()=>evaluate('('+(()=>{
    const selectors=['.camera-film-heading','.camera-film-poster','.camera-ticket','.camera-actions'];
    return Object.fromEntries(selectors.map(s=>{const r=globalThis.document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,width:r.width,height:r.height}]}));
  }).toString()+')()');
  const crop=async(rect)=>{
    const data=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip:{x:Math.floor(rect.x),y:Math.floor(rect.y),width:Math.ceil(rect.width),height:Math.ceil(rect.height),scale:1}});
    const img=await loadImage(Buffer.from(data.data,'base64'));const c=createCanvas(img.width,img.height);const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {bytes:Buffer.from(data.data,'base64'),pixels:ctx.getImageData(0,0,img.width,img.height).data};
  };
  for(const [width,height] of [[1920,1200],[1366,768]])for(const mode of ['solo','group']){
    await load(5546,width,height);
    await evaluate(`document.querySelector('[data-mode="${mode}"]').click();document.getElementById('prepareNextBtn').click()`);
    await evaluate(`Promise.all([...document.querySelectorAll('#cameraView img')].filter(i=>i.src&&!i.hidden).map(i=>i.decode()))`);
    await wait(200);
    const before=await measure();
    const region={x:before['.camera-film-heading'].x,y:before['.camera-film-heading'].y,width:before['.camera-film-heading'].width,height:before['.camera-ticket'].y+before['.camera-ticket'].height-before['.camera-film-heading'].y};
    const a=await crop(region);await fs.writeFile(path.join(out,`${width}-${mode}-before-region.png`),a.bytes);
    await screenshot(`${width}-${mode}-before`);
    const appearance=await evaluate(`(()=>{const n=document.querySelector('.camera-ticket-name');const im=document.querySelector('.camera-example');return {nameFont:getComputedStyle(n).fontSize,nameWidth:n.clientWidth,nameScroll:n.scrollWidth,caption:document.querySelector('.camera-example-label').textContent,photo:im.naturalWidth,heading:document.querySelector('#cameraWorkspace h1').textContent}})()`);
    console.log(JSON.stringify(appearance));
    assert.ok(appearance.nameScroll<=appearance.nameWidth,'예시 이름은 한 줄에서 생략 없음');
    assert.equal(appearance.nameFont,'11px');
    if(mode==='solo')assert.ok(appearance.photo>=1536,'개인 사진 원본 해상도');
    await evaluate(`(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#66768b';x.fillRect(0,0,640,480);window.__cameraTestStream=c.captureStream(15);navigator.mediaDevices.getUserMedia=async()=>window.__cameraTestStream;document.getElementById('startBtn').click();})()`);
    await wait(350);
    await evaluate("document.getElementById('shotBtn').click()");
    for(let i=0;i<60;i++){await wait(100);if(await evaluate("!document.getElementById('generateBtn').hidden"))break;}
    assert.equal(await evaluate("document.getElementById('generateBtn').hidden"),false,'촬영 후 상태 도달');
    if(selfTest)await evaluate("document.querySelector('.camera-film-card').style.transform='translateY(1px)'");
    const after=await measure();const deltas=Object.fromEntries(selectors.map(s=>[s,Object.fromEntries(Object.keys(before[s]).map(k=>[k,after[s][k]-before[s][k]]))]));
    const b=await crop(region);let pixels=0;for(let i=0;i<a.pixels.length;i+=4)if(a.pixels[i]!==b.pixels[i]||a.pixels[i+1]!==b.pixels[i+1]||a.pixels[i+2]!==b.pixels[i+2]||a.pixels[i+3]!==b.pixels[i+3])pixels++;
    await fs.writeFile(path.join(out,`${width}-${mode}-after-region.png`),b.bytes);
    await screenshot(`${width}-${mode}-after`);
    const row={width,height,mode,before,after,deltas,changedPixels:pixels,appearance};rows.push(row);console.log(JSON.stringify(row));
    await fs.writeFile(path.join(out,'result.json'),JSON.stringify(rows,null,2));
    assert.deepEqual(after,before,'촬영 전후 하단 네 요소 좌표와 크기 0px 차이');
    assert.equal(pixels,0,'영화 제목·포스터·티켓 영역의 픽셀 차이 0');
    assert.equal(await evaluate("window.__cameraTestStream.getTracks()[0].readyState"),'ended','촬영 후 스트림 종료');
    await wait(2500);
    assert.equal(await evaluate("!!document.querySelector('.camera-capture-notice')"),false,'촬영 완료 알림 자동 종료');
  }
  assert.equal(errors.length,0);
  assert.equal(network.filter(u=>/cloudfunctions\.net|run\.app|api\.openai/.test(u)).length,0);
  console.log(JSON.stringify({pairs:rows.length,changedPixels:rows.reduce((n,r)=>n+r.changedPixels,0),errors:errors.length,actualApiRequests:0}));
  await send('Browser.close');
} finally {socket?.close();chrome.kill();for(const server of servers)server.close();}

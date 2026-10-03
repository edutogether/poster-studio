/* 헤드리스 실제 빌드 확인. 카메라는 캔버스 스트림, AI는 고정 응답이며
   네트워크 계층에서도 모든 외부 주소를 차단한다. 실제 과금·촬영·인쇄는 없다.
   node scripts/verify/camera-controls.mjs [--selftest: 포스터 이미지 차단으로 검사가 실패하는지 확인] */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const selfTest = process.argv.includes("--selftest");
const out = path.join(root, ".cache", "camera-controls-verification");
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
  await new Promise((resolve) => server.listen(5544 + i, "127.0.0.1", resolve));
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
    "--remote-debugging-port=9534",
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
      target = (await (await fetch("http://127.0.0.1:9534/json")).json()).find(
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
    urls: ["https://*", "http://*.cloudfunctions.net/*", ...(selfTest ? ["*/reference-sf.jpg"] : [])],
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
  for(const [width,height] of [[1920,1080],[1920,1200],[1366,768],[1280,720],[390,844]]) {
    await load(5544,width,height);
    const group = width === 1920 || width === 390;
    if(group) await evaluate(`document.querySelector('[data-mode="group"]').click()`);
    await evaluate(`document.getElementById('prepareNextBtn').click()`);
    await wait(150);
    const example=await evaluate(`(()=>{const img=document.querySelector('.camera-example');return {path:new URL(img.src).pathname,loaded:img.complete&&img.naturalWidth>0,tip:document.querySelectorAll('#cameraWorkspace .camera-tips strong')[1].textContent,fit:getComputedStyle(img).objectFit}})()`);
    assert.ok(example.loaded,'촬영 예시 사진 로드');
    assert.equal(example.path,group ? '/studio/camera-group.webp' : '/studio/camera-student.webp');
    assert.equal(example.tip,group ? '표정은 우리답게' : '표정은 나답게');
    const appearance=await evaluate(`(()=>{const names=document.querySelector('.camera-ticket-name');return {heading:document.querySelector('#cameraWorkspace .camera-heading-accent').textContent,accent:getComputedStyle(document.querySelector('#cameraWorkspace .camera-heading-accent')).color,left:getComputedStyle(document.querySelector('.camera-surface')).backgroundColor,right:getComputedStyle(document.getElementById('cameraWorkspace')).backgroundColor,whiteSpace:getComputedStyle(names).whiteSpace,font:parseFloat(getComputedStyle(names).fontSize),fits:names.scrollWidth<=names.clientWidth}})()`);
    assert.equal(appearance.heading,group ? '우리답게,' : '나답게,');
    assert.equal(appearance.accent,'rgb(237, 49, 36)');
    assert.equal(appearance.left,'rgb(255, 255, 255)');
    assert.equal(appearance.right,'rgb(245, 245, 245)');
    assert.equal(appearance.whiteSpace,'nowrap');
    assert.ok(appearance.font<=11,'티켓 출연진 한 줄 글자 크기');
    if(width>=1100) assert.ok(appearance.fits,'예시 단체명과 다섯 이름이 생략 없이 한 줄');
    if(width===1920&&height===1080){
      for(const mode of ['solo','group']){
        await evaluate(`document.querySelector('#cameraWorkspace .back-button').click()`);
        await evaluate(`document.querySelector('[data-mode="${mode}"]').click()`);
        await evaluate(`document.getElementById('prepareNextBtn').click()`);
        await evaluate(`document.querySelector('.camera-example').decode()`);
        assert.equal(await evaluate(`new URL(document.querySelector('.camera-example').src).pathname`),mode==='solo'?'/studio/camera-student.webp':'/studio/camera-group.webp','왕복 후 모드에 맞는 사진');
        assert.equal(await evaluate(`document.querySelectorAll('#cameraWorkspace .camera-tips strong')[1].textContent`),mode==='solo'?'표정은 나답게':'표정은 우리답게','왕복 후 모드에 맞는 안내');
      }
    }
    if(group) assert.equal(example.fit,'cover','단체 예시를 원본 비율로 확대해 검은 여백 없이 표시');
    const layout=await evaluate(`(()=>{const img=document.querySelector('.camera-film-scene img');const ticket=document.querySelector('.camera-ticket');const r=ticket.getBoundingClientRect();return {imageReady:img.complete&&img.naturalWidth>0,fit:getComputedStyle(img).objectFit,mask:getComputedStyle(ticket).maskImage,h1:getComputedStyle(document.querySelector('#cameraWorkspace h1')).fontSize,h2:getComputedStyle(document.querySelector('.camera-film-heading h2')).fontSize,accent:getComputedStyle(document.querySelector('#cameraWorkspace .camera-heading-accent')).color,ticketBottom:r.bottom,buttonTop:document.getElementById('shotBtn').getBoundingClientRect().top,scrollWidth:document.documentElement.scrollWidth}})()`);
    assert.ok(layout.imageReady,'선택 포스터 이미지 로드');
    assert.equal(layout.fit,'contain','세로 포스터 전체 표시');
    assert.notEqual(layout.mask,'none','티켓 구멍은 배경이 비치는 마스크');
    assert.equal(layout.h1,layout.h2,'두 제목의 크기 일치');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.camera-ticket')).backgroundColor`),'rgb(255, 255, 255)','티켓은 흰색');
    if(height===1200) {
      const spacing=await evaluate(`(()=>{const poster=document.querySelector('.camera-film-poster img').getBoundingClientRect();const tips=document.querySelector('.camera-tips').getBoundingClientRect();const title=document.querySelector('.camera-film-heading').getBoundingClientRect();return {posterHeight:poster.height,sectionGap:title.top-tips.bottom,padding:parseFloat(getComputedStyle(document.getElementById('cameraWorkspace')).paddingTop)}})()`);
      assert.ok(spacing.posterHeight>380,'넉넉한 화면에서는 기존 380px보다 포스터 확대');
      assert.ok(spacing.sectionGap>=40&&spacing.padding>=64,'영역 사이와 개인정보 링크 아래 여백');
    }
    assert.ok(layout.ticketBottom<=layout.buttonTop,'티켓이 버튼에 잘리지 않음');
    assert.ok(layout.scrollWidth<=width,'가로 넘침 없음');
    const placement=await evaluate(`(()=>{const tips=document.querySelector('#cameraWorkspace .camera-tips');const img=document.querySelector('.camera-film-poster img').getBoundingClientRect();const tag=document.querySelector('.camera-film-poster span').getBoundingClientRect();const ticket=document.querySelector('.camera-ticket').getBoundingClientRect();const button=document.getElementById('shotBtn').getBoundingClientRect();return {tips:tips?.children.length,above:tips?.getBoundingClientRect().bottom<=document.querySelector('.camera-film-heading').getBoundingClientRect().top,tagInside:tag.left>=img.left&&tag.right<=img.right&&tag.top>=img.top&&tag.bottom<=img.bottom,gap:ticket.top-img.bottom,buttonBottom:button.bottom}})()`);
    assert.equal(placement.tips,3,'오른쪽에 촬영 안내 1·2·3 복원');
    assert.ok(placement.above,'안내는 영화 카드 위에 배치');
    assert.ok(placement.tagInside,'개인/단체 태그는 실제 포스터 안에 배치');
    assert.ok(placement.gap>=0&&placement.gap<=13,'포스터와 티켓 사이 여백은 12px');
    if(width>=1100) assert.ok(placement.buttonBottom<=height,'촬영 버튼이 화면 안에 보임');
    await screenshot(`camera-${width}`);
    const startPosition=await evaluate(`(()=>{const r=document.getElementById('startBtn').getBoundingClientRect();return {right:r.right,bottom:r.bottom}})()`);
    if(width>=1100){
      const start=await evaluate(`(()=>{const r=document.getElementById('startBtn').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:start.x,y:start.y});
      await wait(250);
      assert.equal(await evaluate(`getComputedStyle(document.getElementById('startBtn')).backgroundColor`),'rgb(230, 48, 37)','켜기 버튼 호버는 빨강');
    }
    await evaluate(`(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const x=c.getContext('2d');x.fillStyle='#66768b';x.fillRect(0,0,640,480);window.__cameraTestStream=c.captureStream(15);navigator.mediaDevices.getUserMedia=async()=>window.__cameraTestStream;document.getElementById('startBtn').click();})()`);
    await wait(300);
    assert.ok(await evaluate(`!!document.querySelector('.camera-ready-notice')`),'준비 알림');
    assert.ok(await evaluate(`!!document.querySelector('.camera-live-indicator')`),'붉은 카메라 켜짐 표시');
    assert.equal(await evaluate(`document.getElementById('status').textContent`),'');
    const overlays=await evaluate(`(()=>{const r=document.querySelector('.cameraBox').getBoundingClientRect();const n=document.querySelector('.camera-ready-notice').getBoundingClientRect();const i=document.querySelector('.camera-live-indicator');const b=i.getBoundingClientRect();const stop=document.getElementById('stopCameraBtn').getBoundingClientRect();return {centerX:Math.abs(n.x+n.width/2-r.x-r.width/2),centerY:Math.abs(n.y+n.height/2-r.y-r.height/2),noticeHeight:n.height,noticeWidth:n.width,indicator:i.textContent,topRight:b.left>r.x+r.width/2&&b.top<r.y+r.height/4,stopRight:stop.right,stopBottom:stop.bottom,pulse:getComputedStyle(i.querySelector('i')).animationDuration}})()`);
    assert.ok(overlays.centerX<1&&overlays.centerY<1,'알림은 페이지가 아닌 카메라 영역 중앙');
    assert.ok(overlays.noticeHeight<=52&&overlays.noticeWidth<=230,'준비 알림은 작은 한 줄 토스트');
    assert.equal(overlays.indicator,'실시간 미리보기');
    assert.ok(overlays.topRight,'상태 표시 우상단');
    assert.equal(overlays.pulse,'1.6s');
    assert.ok(Math.abs(overlays.stopRight-startPosition.right)<1&&Math.abs(overlays.stopBottom-startPosition.bottom)<1,'켜기/끄기는 같은 위치');
    await screenshot(`camera-live-${width}`);
    if(width===1366){await wait(1800);assert.equal(await evaluate(`!!document.querySelector('.camera-ready-notice')`),false,'준비 알림 자동 제거');}
    await evaluate(`document.getElementById('stopCameraBtn').click()`);
    await wait(100);
    assert.equal(await evaluate(`window.__cameraTestStream.getTracks()[0].readyState`),'ended','실제 트랙 종료');
    assert.equal(await evaluate(`!!document.querySelector('.camera-live-indicator')`),false);
    assert.equal(await evaluate(`!!document.querySelector('.camera-ready-notice')`),false);
    layouts.push(layout);
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

/* 승인된 8종 조판의 Windows 출시 기준선 및 라이브 대조.
   node scripts/verify/release-baseline.mjs [라이브 URL]
   헤드리스 실제 빌드 확인. 카메라는 캔버스 스트림, AI는 고정 응답이며
   네트워크 계층에서도 모든 외부 주소를 차단한다. 실제 과금·촬영·인쇄는 없다.
   로컬 실행에서 5개 입력 × 8개 디자인을 저장하고 라이브 실행은 저장 지문과 대조한다. */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const liveURL = process.argv.slice(2).find(arg => /^https?:/.test(arg));
const selfTest = process.argv.includes("--selftest");
const out = path.join(root, ".cache", liveURL ? "release-live" : "release-local");
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
  await new Promise((resolve) => server.listen(5557 + i, "127.0.0.1", resolve));
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
    "--remote-debugging-port=9557",
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
      target = (await (await fetch("http://127.0.0.1:9557/json")).json()).find(
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
  /* 값이 필요한 페이지 코드는 값을 코드 문자열에 끼워 넣지 않고 인자로 넘긴다 — 제목 같은 입력값에 따옴표·
     </script>가 섞여도 코드가 되지 않는다. 함수 본문은 이 파일에 고정된 글이다. */
  const callWith = async (functionDeclaration, arg) => {
    const { result: win } = await send("Runtime.evaluate", { expression: "window" });
    const r = await send("Runtime.callFunctionOn", {
      objectId: win.objectId,
      functionDeclaration,
      arguments: [{ value: arg }],
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
    urls: ["*://*.cloudfunctions.net/*", "*://*.run.app/*", "*://api.openai.com/*"],
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
    await send("Page.navigate", { url: liveURL || `http://127.0.0.1:${port}/` });
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

  const cases = [
    {name:'기본값', mode:'solo', title:'', person:'', genre:'sf'},
    {name:'개인 한글', mode:'solo', title:'우주를 달리는 인키', person:'김태범', genre:'animation'},
    {name:'영문', mode:'solo', title:'GALAXY RUNNER', person:'박하늘', genre:'sf'},
    {name:'긴 제목', mode:'solo', title:'아주아주 긴 제목을 넣으면 두 줄로 갈라지는지 보는 시험', person:'이영화', genre:'fantasy'},
    {name:'단체', mode:'group', title:'사라진 급식의 비밀', person:'햇살초 영화동아리', genre:'mystery'},
  ];
  const pixels=[];
  const expectedLabels=['시네마','에디토리얼','컬러 블록','아치 프레임','필름스트립','폴라로이드','타이포그래피','트립틱'];
  for (const c of cases) {
    await load(5557,1366,900);
    await evaluate(`(()=>{
      let seed=20261003;Math.random=()=>{seed|=0;seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
      const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;
      const ctx=canvas.getContext('2d');const g=ctx.createLinearGradient(0,0,1200,1800);g.addColorStop(0,'#d9a44a');g.addColorStop(1,'#172633');ctx.fillStyle=g;ctx.fillRect(0,0,1200,1800);
      ctx.fillStyle='#ffe9ac';ctx.beginPath();ctx.arc(600,650,220,0,Math.PI*2);ctx.fill();
      window.__cameraFrames=setInterval(()=>ctx.fillRect(0,1798,2,2),33);
      window.__stream=canvas.captureStream(30);navigator.mediaDevices.getUserMedia=async()=>window.__stream;
      const original=window.fetch;window.__forms=[];
      window.fetch=async(url,options)=>{if(String(url).includes('/generate')){
        window.__forms.push([...options.body.keys()].sort());
        return new Response(JSON.stringify({images:[canvas.toDataURL('image/png')]}),{status:200,headers:{'content-type':'application/json'}});
      }return original(url,options);};
      window.__texts=[];const draw=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...args){window.__texts.push(t);return draw.call(this,t,...args);};
    })()`);
    await callWith("(mode)=>{[...document.querySelectorAll('[data-mode]')].find((b)=>b.dataset.mode===mode).click();}", c.mode);
    await wait(80);
    await callWith("(c)=>{document.getElementById('movieTitle').value=c.title;document.getElementById(c.mode==='solo'?'studentName':'groupName').value=c.person;document.getElementById('genre').value=c.genre;document.getElementById('prepareNextBtn').click();}", c);
    await wait(80);
    assert.ok((await evaluate("document.getElementById('shotBtn').textContent")).includes('3초 뒤 사진 찍기'),'운영 빌드는 샘플 건너뛰기 비활성');
    await evaluate("document.getElementById('startBtn').click()");
    for(let i=0;i<60;i++){if(await evaluate("document.getElementById('video').videoWidth>0"))break;await wait(100);}
    assert.ok(await evaluate("document.getElementById('video').videoWidth>0"));
    await evaluate("document.getElementById('shotBtn').click()");
    for(let i=0;i<80;i++){if(await evaluate("!document.getElementById('generateBtn').hidden"))break;await wait(100);}
    assert.equal(await evaluate("document.getElementById('generateBtn').hidden"),false);
    assert.equal(await evaluate("window.__stream.getTracks().every(t=>t.readyState==='ended')"),true,'촬영 후 카메라 해제');
    await evaluate("document.getElementById('generateBtn').click()");
    for(let i=0;i<150;i++){if(await evaluate("document.querySelectorAll('.style-option').length===8"))break;await wait(100);}
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.style-name')].map(e=>e.textContent)"),expectedLabels);
    assert.deepEqual(await evaluate('window.__forms'),[['genre','mode','movieTitle','photo','tagline']]);
    if(c.mode==='solo')assert.ok((await evaluate('window.__texts')).includes('주연 · 감독   '+(c.person||'김인키')),'성을 포함한 전체 이름');
    const fingerprints=await evaluate(`(async()=>{const out=[];for(const [i,b] of [...document.querySelectorAll('.style-option')].entries()){
      b.click();await new Promise(r=>setTimeout(r,30));const canvas=document.getElementById('posterCanvas');
      if(canvas.width!==1200||canvas.height!==1800)throw Error('인화 규격 불일치');
      const rgba=canvas.getContext('2d').getImageData(0,0,1200,1800).data;
      const bytes=await crypto.subtle.digest('SHA-256',rgba);
      out.push({판:b.querySelector('.style-name').textContent,지문:[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')});
    }return out;})()`);
    assert.equal(new Set(fingerprints.map(p=>p.지문)).size,8,'8종 구별');
    pixels.push(...fingerprints.map(p=>({케이스:c.name,...p})));
    await wait(2300);
    await screenshot('result-'+cases.indexOf(c));
    await evaluate("document.getElementById('printBtn').click()");await wait(200);
    assert.equal(await evaluate('window.__printCalls'),1);
    await evaluate("window.dispatchEvent(new Event('afterprint'))");await wait(50);
    assert.equal(await evaluate("document.getElementById('printArea')===null"),true);
    await evaluate("document.querySelector('[aria-label=\"다음 주인공\"]').click()");await wait(100);
    assert.equal(await evaluate("document.getElementById('snapshot').getAttribute('src')"),null);
    assert.equal(await evaluate("document.querySelectorAll('.style-option').length"),0);
    console.log(JSON.stringify({case:c.name,posters:8,print:1,privacy:'pass',cameraStopped:true}));
  }
  assert.equal(pixels.length,40);
  const baseline='scripts/verify/snapshots/release-20261003-windows.json';
  if(liveURL || selfTest){
    const expected=JSON.parse(await fs.readFile(baseline,'utf8'));
    if(selfTest)expected[0].지문='intentional-mismatch';
    assert.deepEqual(pixels,expected,'배포된 40종 픽셀은 승인 로컬 기준선과 일치');
  }
  await fs.writeFile(path.join(out,'pixels.json'),JSON.stringify(pixels,null,2)+'\n');
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert.equal(network.filter(u=>/cloudfunctions\.net|run\.app|api\.openai/.test(u)).length,0);
  console.log(JSON.stringify({posters:40,errors:0,actualApiRequests:0,liveCompared:!!liveURL}));
  await send('Browser.close');
} finally {
  socket?.close();chrome.kill();for(const server of servers)server.close();
}

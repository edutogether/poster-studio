/* 승인된 8종 조판의 Windows 출시 기준선 및 라이브 대조.
   node scripts/verify/release-baseline.mjs [라이브 URL]
   헤드리스 실제 빌드 확인. 카메라는 캔버스 스트림, AI는 고정 응답이며
   네트워크 계층에서도 모든 외부 주소를 차단한다. 실제 과금·촬영·인쇄는 없다.
   로컬 실행에서 5개 입력 × 8개 디자인을 저장하고 라이브 실행은 저장 지문과 대조한다.
   ⚠ 촬영 흐름을 누르므로 **실제 모드 빌드**가 필요하다. 배포 빌드는 샘플 단추가 있는 판일 수 있으니(예전에는 .env.production의
   VITE_SAMPLE_MODE) 로컬은 진짜 생성만인 판으로 빌드한 뒤 돌린다 — 10/20부터 `npx vite build --mode check-real`(스위치는 src/studioMode.ts).
   --rare(2026-10-26): 입력을 드문 음절 · 영문 · 숫자 · 기호 4종(32장)으로 바꾼다 — 포스터 글꼴 조각(핵심 · 드문 글자)을 두 판에서 견줄 때.
   --block <주소 무늬,...>(2026-10-26): 그 파일들을 망에서 막는다 — 예: fonts/full 아래 «-r» 조각(드문 글자) 무늬로 못 받는 경우를 만들어
   결과가 막지 않은 때와 같은지(원본 통글꼴로 대신 받는지) 본다. 막힌 요청이 0건이면 실패다(무늬 오타를 통과시키지 않게).
   --expect <pixels.json>(2026-10-26): 지문이 그 파일과 장마다 같아야 통과 — 두 판 대조 · 막기 대조를 손으로 하지 않게.
   이 선택들은 기준선 대조(라이브)와 같이 쓰지 않는다. */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
const liveURL = process.argv.slice(2).find(arg => /^https?:/.test(arg));
const selfTest = process.argv.includes("--selftest");
const rareCases = process.argv.includes("--rare");
const blockAt = process.argv.indexOf("--block");
const blockValue = blockAt > 0 ? process.argv[blockAt + 1] : null;
if (blockAt > 0 && (!blockValue || blockValue.startsWith("--"))) { console.error("--block에는 막을 주소 무늬(쉼표로 여럿)를 준다"); process.exit(2); }
const extraBlocked = blockValue ? blockValue.split(",") : [];
// --expect <pixels.json>(2026-10-26): 그 지문과 장마다 같은지 단언한다 — 막기 결과를 손으로 대조하지 않게
const expectAt = process.argv.indexOf("--expect");
const expectFile = expectAt > 0 ? process.argv[expectAt + 1] : null;
if (expectAt > 0 && (!expectFile || expectFile.startsWith("--"))) { console.error("--expect에는 기준 pixels.json 경로를 준다"); process.exit(2); }
const out = path.join(root, ".cache", liveURL ? "release-live" : `release-local${rareCases ? "-rare" : ""}${extraBlocked.length ? "-blocked" : ""}`);
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
    let name; // 깨진 주소면 400 — 예외로 서버가 죽지 않게(10/26)
    try { name = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400); res.end(); return; }
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
let blockedRequests = 0;
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
    if (m.method === "Network.loadingFailed" && m.params.blockedReason)
      blockedRequests++;
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
    urls: ["*://*.cloudfunctions.net/*", "*://*.run.app/*", "*://api.openai.com/*", ...extraBlocked],
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

  const cases = rareCases ? [
    {name:'드문 음절', mode:'solo', title:'똠방각하 뷁햏 쀍쉙', person:'갂꺆똘', genre:'sf'},
    {name:'드문 기호', mode:'solo', title:'Ωmega™ ∞ ←→ ½', person:'햏님', genre:'fantasy'},
    {name:'단체 드문', mode:'group', title:'꽥꽥 뜽뜽 쌰쌰', person:'뷁초 퓌퓌 동아리', genre:'mystery'},
    {name:'숫자 · 문장부호', mode:'solo', title:'제2편: 3·1 영웅! (2026) #1 100%', person:'Kim & 이', genre:'hero'},
  ] : [
    {name:'기본값', mode:'solo', title:'', person:'', genre:'sf'},
    {name:'개인 한글', mode:'solo', title:'우주를 달리는 인키', person:'김태범', genre:'animation'},
    {name:'영문', mode:'solo', title:'GALAXY RUNNER', person:'박하늘', genre:'sf'},
    {name:'긴 제목', mode:'solo', title:'아주아주 긴 제목을 넣으면 두 줄로 갈라지는지 보는 시험', person:'이영화', genre:'fantasy'},
    {name:'단체', mode:'group', title:'사라진 급식의 비밀', person:'햇살초 영화동아리', genre:'mystery'},
  ];
  const pixels=[];
  const expectedLabels=['시네마','에디토리얼','컬러 블록','아치 프레임','필름 스트립','폴라로이드','타이포그래피','트립틱'];
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
    const shotLabel = await evaluate("document.getElementById('shotBtn').textContent");
    assert.ok(!shotLabel.includes('샘플 포스터 보기'), '샘플 단추가 있는 판이다 — `npx vite build --mode check-real`로 다시 빌드한 뒤 돌린다(이 도구는 실제 촬영 흐름을 본다)');
    assert.ok(shotLabel.includes('3초 뒤 사진 찍기'), '촬영 단추 문구가 «3초 뒤 사진 찍기»가 아니다');
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
  assert.equal(pixels.length,cases.length*8);
  const baseline='scripts/verify/snapshots/release-20261003-windows.json';
  if((liveURL || selfTest) && !rareCases && !extraBlocked.length){
    const expected=JSON.parse(await fs.readFile(baseline,'utf8'));
    if(selfTest)expected[0].지문='intentional-mismatch';
    assert.deepEqual(pixels,expected,'배포된 40종 픽셀은 승인 로컬 기준선과 일치');
  }
  await fs.writeFile(path.join(out,'pixels.json'),JSON.stringify(pixels,null,2)+'\n');
  // --block은 실제로 막힌 요청이 있어야 의미가 있다 — 무늬 오타면 아무것도 안 막고 통과했다(10/26 종합감사)
  if(extraBlocked.length)assert.ok(blockedRequests>0,`--block 무늬에 걸려 막힌 요청이 0건이다: ${extraBlocked.join(',')}`);
  if(expectFile){
    const expected=JSON.parse(await fs.readFile(expectFile,'utf8'));
    assert.deepEqual(pixels,expected,`포스터 지문이 기준(${expectFile})과 다르다`);
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert.equal(network.filter(u=>/cloudfunctions\.net|run\.app|api\.openai/.test(u)).length,0);
  console.log(JSON.stringify({posters:pixels.length,errors:0,actualApiRequests:0,liveCompared:!!liveURL,rare:rareCases,blocked:extraBlocked,blockedRequests,expected:expectFile}));
  await send('Browser.close');
} finally {
  socket?.close();chrome.kill();for(const server of servers)server.close();
}

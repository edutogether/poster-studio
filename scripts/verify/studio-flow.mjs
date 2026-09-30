/* 헤드리스 실제 빌드 확인. 카메라는 캔버스 스트림, AI는 고정 응답이며
   네트워크 계층에서도 모든 외부 주소를 차단한다. 실제 과금·촬영·인쇄는 없다.
   node scripts/verify/studio-flow.mjs [이전 dist 경로] */
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = process.cwd();
assert.ok(
  process.argv[2],
  "수정 전 dist 경로를 지정해야 출력 픽셀을 대조할 수 있습니다.",
);
const out = path.join(root, ".cache", "studio-verification");
await fs.mkdir(out, { recursive: true });
const headers = JSON.parse(await fs.readFile("firebase.json", "utf8")).hosting
  .headers[0].headers;
const roots = [path.resolve(process.argv[2]), path.resolve("dist")];
assert.notEqual(
  roots[0],
  roots[1],
  "같은 빌드를 서로 비교하면 검증이 아닙니다.",
);
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
    urls: ["https://*", "http://*.cloudfunctions.net/*"],
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
    await wait(3300);
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
  const pixelTool = await fs.readFile(
    "scripts/verify/poster-pixels-ui.js",
    "utf8",
  );
  const results = [];
  for (let i = 0; i < 2; i++) {
    await load(5530 + i);
    if (i === 1) await screenshot("준비-1366");
    await evaluate(pixelTool);
    const pixels = await evaluate("window.__posterPixelsUI()");
    await fs.writeFile(
      path.join(out, `pixels-${i}.json`),
      JSON.stringify(pixels, null, 2),
    );
    assert.equal(pixels.length, 20, "5가지 입력 × 4가지 스타일");
    results.push(pixels);
    if (i === 1) {
      assert.equal(
        await evaluate(`document.getElementById('resultView').hidden`),
        false,
      );
      await screenshot("결과-1366");
      await evaluate(`document.getElementById('printBtn').click()`);
      await wait(200);
      assert.equal(
        await evaluate("window.__printCalls"),
        1,
        "실제 포스터 이미지로 인쇄 호출",
      );
      await evaluate(`window.dispatchEvent(new Event('afterprint'))`);
      assert.equal(
        await evaluate(`document.getElementById('printArea')===null`),
        true,
      );
      await evaluate(
        `[...document.querySelectorAll('button')].find(b=>b.textContent==='다음 주인공').click()`,
      );
      await wait(100);
      assert.equal(
        await evaluate(
          `document.getElementById('snapshot').getAttribute('src')`,
        ),
        null,
        "다음 참가자에게 이전 사진이 남지 않음",
      );
      await evaluate(`document.getElementById('prepareNextBtn').click()`);
      await wait(100);
      await screenshot("촬영-1366");
    }
  }
  assert.deepEqual(
    results[1],
    results[0],
    "새 화면의 출력 픽셀은 이전 앱과 완전히 동일",
  );
  const layouts = [];
  for (const [width, height] of [
    [1920, 1200],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    await load(5531, width, height);
    await evaluate(`document.querySelector('[data-mode=group]').click()`);
    await wait(50);
    const layout = await evaluate(
      `(()=>{const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,width:b.width,height:b.height}};return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,cards:[...document.querySelectorAll('.genre-art')].map(r),cta:r(document.getElementById('prepareNextBtn')),images:[...document.querySelectorAll('#prepareView img')].every(i=>i.complete&&i.naturalWidth>0)}})()`,
    );
    assert.ok(layout.images, "포스터·로고 이미지 누락 없음");
    assert.ok(layout.scrollWidth <= width, "가로 넘침 없음");
    if (width >= 1100) {
      assert.ok(layout.cta.bottom <= height, "첫 화면 버튼이 화면 안에 보임");
      assert.ok(
        layout.cards.every((c) => c.width > 60 && c.height > 100),
        "여덟 포스터의 크기 확보",
      );
    }
    layouts.push(layout);
    await screenshot(`준비-${width}`);
  }
  assert.equal(errors.length, 0, "브라우저 실행 오류 없음");
  assert.equal(
    network.filter((url) =>
      /cloudfunctions\.net|run\.app|api\.openai/.test(url),
    ).length,
    0,
    "실제 API 요청 0건",
  );
  await fs.writeFile(
    path.join(out, "결과.json"),
    JSON.stringify(
      {
        pixelPairs: 20,
        pixelDifferences: 0,
        layouts,
        runtimeErrors: errors.length,
        actualApiRequests: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      pixelPairs: 20,
      pixelDifferences: 0,
      viewports: layouts.length,
      runtimeErrors: 0,
      actualApiRequests: 0,
    }),
  );
  await send("Browser.close");
} finally {
  socket?.close();
  chrome.kill();
  for (const server of servers) server.close();
}

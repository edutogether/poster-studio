// 빌드된 앱에서 새 문서 진입·스플래시·입력 초기화·헤더 반응형을 확인한다.
// --selftest는 클릭을 생략하여 재시작 검사가 실제 실패하는지 확인한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const out = path.resolve('.cache/header-home', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(out, { recursive: true });
const root = path.resolve('dist');
const headers = JSON.parse(await fs.readFile('firebase.json', 'utf8')).hosting.headers[0].headers;
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
  try {
    const bytes = await fs.readFile(file);
    for (const { key, value } of headers) res.setHeader(key, value);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(5559, '127.0.0.1', resolve));
const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=9548',`--user-data-dir=${out}/chrome`,'about:blank'], { windowsHide:true, stdio:'ignore' });
const delay = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms));
let socket, seq = 0;
const pending = new Map(), requests = [], reports = [];
try {
  let target;
  for (let i=0;i<60;i++) { try { target = (await (await fetch('http://127.0.0.1:9548/json')).json()).find(t=>t.type==='page'); if(target) break; } catch {} await delay(100); }
  assert.ok(target, '헤드리스 브라우저 시작');
  socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ socket.onopen=resolve; socket.onerror=reject; });
  socket.onmessage = ({data}) => {
    const m=JSON.parse(data);
    if(m.method==='Network.requestWillBeSent') requests.push(m.params.request.url);
    if(m.id) { const p=pending.get(m.id); pending.delete(m.id); m.error?p.reject(Error(m.error.message)):p.resolve(m.result); }
  };
  const call = (method,params={}) => new Promise((resolve,reject)=>{ const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params})); });
  const evaluate = async expression => { const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value; };
  const until = async expression => {
    for(let i=0;i<100;i++) { try { if(await evaluate(expression)) return; } catch {} await delay(100); }
    assert.fail(`시간 초과: ${expression}`);
  };
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['https://*','*/generate*']});
  await call('Page.addScriptToEvaluateOnNewDocument',{source:`document.addEventListener('DOMContentLoaded',()=>{window.__splashAtBoot=!!document.getElementById('splash');});navigator.mediaDevices.getUserMedia=async()=>{throw Error('실제 카메라 사용 금지');};`});
  await call('Page.navigate',{url:'http://127.0.0.1:5559/'});
  await until('!!document.querySelector(".header-home") && !document.getElementById("splash")');
  for (const selector of ['.brand.header-home','.festival-brand.header-home']) {
    const before = await evaluate('performance.timeOrigin');
    await evaluate(`document.querySelector('[data-mode="group"]').click();document.getElementById('movieTitle').value='검증용 영화';document.getElementById('groupName').value='검증용 모둠';document.querySelector('[data-genre="fantasy"]').click();sessionStorage.setItem('poster-studio-wait-opening','test');sessionStorage.setItem('unrelated-check','keep');document.getElementById('prepareNextBtn').click();`);
    await until('document.body.dataset.step === "2"');
    if(!process.argv.includes('--selftest')) await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await until(`performance.timeOrigin !== ${before} && !!document.querySelector('.header-home')`);
    const boot = await evaluate(`({splash:window.__splashAtBoot,step:document.body.dataset.step,title:document.getElementById('movieTitle').value,name:document.getElementById('studentName').value,group:document.getElementById('groupName').value,solo:document.querySelector('[data-mode="solo"]').getAttribute('aria-pressed'),sf:document.querySelector('[data-genre="sf"]').getAttribute('aria-pressed'),opening:sessionStorage.getItem('poster-studio-wait-opening'),unrelated:sessionStorage.getItem('unrelated-check'),url:location.pathname+location.search+location.hash})`);
    assert.deepEqual(boot,{splash:true,step:'1',title:'',name:'',group:'',solo:'true',sf:'true',opening:null,unrelated:'keep',url:'/'});
    await until('!document.getElementById("splash")');
    reports.push({selector,reset:boot});
  }
  assert.equal(new Set(requests.filter(url=>url.includes('?studio-start='))).size,2,'매번 새 홈 문서 요청');
  for (const width of [1920,1366,1024,768,390,360]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
    await delay(150);
    const report = await evaluate(`(() => {const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};};return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,brand:rect('.brand'),festival:rect('.festival-brand'),nav:rect('.header-inner > nav')};})()`);
    const overlaps = (a,b) => a.x<b.right && b.x<a.right && a.y<b.bottom && b.y<a.bottom;
    assert.equal(report.overflow,false);
    assert.equal(overlaps(report.brand,report.festival),false);
    assert.equal(overlaps(report.nav,report.festival),false);
    reports.push(report);
    const shot=await call('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(out,`header-${width}.png`),Buffer.from(shot.data,'base64'));
  }
  assert.equal(requests.filter(url=>url.includes('/generate')).length,0);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({passed:true,resets:2,viewports:6,evidence:out}));
  await call('Browser.close');
} finally { socket?.close();chrome.kill();await new Promise(resolve=>server.close(resolve)); }

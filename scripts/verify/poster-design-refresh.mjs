// 실제 로컬 앱의 샘플 포스터 경로를 확인한다. 카메라와 외부 API는 차단한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const out = path.resolve('.cache/poster-design-refresh');
await fs.mkdir(out, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=9538',`--user-data-dir=${out}/chrome`,'about:blank'], {windowsHide:true,stdio:'ignore'});
const delay = ms => new Promise(r=>globalThis.setTimeout(r,ms));
let socket,seq=0;
const pending = new Map();
try {
  let target;
  for(let i=0;i<50;i++) { try {target=(await(await fetch('http://127.0.0.1:9538/json')).json()).find(t=>t.type==='page');if(target)break;}catch{} await delay(100); }
  assert.ok(target,'브라우저 시작');
  socket=new globalThis.WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}};
  const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});assert.ok(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;};
  const requests=[];
  const originalMessage=socket.onmessage;
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);originalMessage(e);};
  await call('Network.enable');
  await call('Network.setBlockedURLs',{urls:['https://*']});
  await call('Page.enable');
  await call('Page.addScriptToEvaluateOnNewDocument',{source:"navigator.mediaDevices.getUserMedia=async()=>{window.__cameraCalls=(window.__cameraCalls||0)+1;throw Error('디자인 확인 중 카메라 차단');};window.print=()=>{throw Error('디자인 확인 중 인쇄 차단');};"});
  await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:5500/'});
  for(let i=0;i<80;i++){if(await evaluate('!!document.getElementById("shotBtn")'))break;await delay(100);}
  await evaluate('document.fonts.ready');
  await delay(3300);
  await evaluate("document.getElementById('prepareNextBtn').click()");
  await delay(100);
  assert.ok((await evaluate("document.getElementById('shotBtn').textContent")).includes('샘플 포스터 보기'));
  await evaluate(`window.__posterTexts=[];const draw=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.__posterTexts.push(text);return draw.call(this,text,...args);};document.getElementById('shotBtn').click()`);
  for(let i=0;i<100;i++){if(await evaluate("document.body.dataset.step==='3'"))break;await delay(100);}
  assert.equal(await evaluate('document.body.dataset.step'),'3');
  assert.equal(await evaluate("document.querySelectorAll('.style-option').length"),8);
  const labels=await evaluate("Array.from(document.querySelectorAll('.style-name'),e=>e.textContent)");
  assert.deepEqual(labels,['시네마','에디토리얼','컬러 블록','아치 프레임','필름스트립','폴라로이드','타이포그래피','트립틱']);
  assert.equal(await evaluate("document.querySelector('.result-brand').textContent"),'Poster Studio');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.result-brand em')).color"),'rgb(237, 49, 36)');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.result-artboard')).backgroundColor"),'rgb(245, 245, 245)');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#resultWorkspace')).backgroundColor"),'rgb(255, 255, 255)');
  const images=new Set();
  for(let i=0;i<8;i++){await evaluate(`document.querySelectorAll('.style-option')[${i}].click()`);await delay(50);images.add(await evaluate("document.querySelector('#resultView canvas').toDataURL()"));}
  assert.equal(images.size,8,'8개 틀 선택 시 큰 포스터도 변경');
  assert.equal(await evaluate(`window.__posterTexts.filter(t=>t==='주연 · 감독   김인키').length`),8,'빈 입력의 완성 크레딧은 김인키');
  assert.equal(await evaluate(`document.querySelector('.result-brand-icon').getAttribute('src')`),'/studio/clapperboard-apple.png');
  assert.equal(await evaluate(`document.querySelector('.result-brand-icon').naturalWidth>0`),true,'기존 고급형 슬레이트 로드');
  assert.equal(await evaluate('window.__cameraCalls||0'),0);
  assert.equal(requests.filter(u=>/cloudfunctions|run\.app|api\.openai/.test(u)).length,0);
  await evaluate("document.querySelectorAll('.style-option')[0].click()");await delay(100);
  const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,'sample.png'),Buffer.from(shot.data,'base64'));
  console.log(JSON.stringify({templates:images.size,cameraCalls:0,apiCalls:0,countdown:false}));
  await evaluate("document.querySelector('[aria-label=\"포스터 크게 보기\"]').click()");
  assert.equal(await evaluate("document.querySelector('.poster-dialog').open"),true);
  await evaluate("document.querySelector('.poster-dialog').close()");
  for(const width of [1366,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await delay(100);
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true,'결과 화면 가로 넘침 없음');
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
  await evaluate(`document.querySelectorAll('.result-actions .back-button')[0].click();document.getElementById('studentName').value='김태범';window.__posterTexts=[];document.getElementById('shotBtn').click()`);
  for(let i=0;i<100;i++){if(await evaluate("document.body.dataset.step==='3'"))break;await delay(100);}
  assert.equal(await evaluate(`window.__posterTexts.filter(t=>t==='주연 · 감독   김태범').length`),8,'입력한 김태범 이름 전체를 8종에 표시');
  console.log(JSON.stringify({defaultName:'김인키',enteredName:'김태범',creditVariants:8,brand:'Poster Studio'}));
  await call('Browser.close');
}finally{socket?.close();chrome.kill();}

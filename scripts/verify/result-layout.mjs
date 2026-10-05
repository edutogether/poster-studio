// 실제 로컬 앱의 샘플 포스터 경로를 확인한다. 카메라와 외부 API는 차단한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const out = path.resolve('.cache/result-layout', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(out, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=9546',`--user-data-dir=${out}/chrome`,'about:blank'], {windowsHide:true,stdio:'ignore'});
const delay = ms => new Promise(r=>globalThis.setTimeout(r,ms));
let socket,seq=0;
const pending = new Map();
try {
  let target;
  for(let i=0;i<50;i++) { try {target=(await(await fetch('http://127.0.0.1:9546/json')).json()).find(t=>t.type==='page');if(target)break;}catch{} await delay(100); }
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

  const reports=[];
  for (const [width,height] of [[2554,1272],[1920,1080],[1366,768],[1100,700],[1024,900],[390,844]]) {
    await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:5500/'});
    for(let i=0;i<100;i++){if(await evaluate('!!document.getElementById("prepareNextBtn")'))break;await delay(100);}
    await evaluate('document.fonts.ready'); await delay(3300);
    const measure = id => evaluate(`(() => {
      const v=document.getElementById('${id}');
      const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      return {workspace:rect(v.querySelector('.workspace')),heading:rect(v.querySelector('h1')),dock:rect(v.querySelector('.action-dock')),button:rect(v.querySelector('.primary-button')),font:getComputedStyle(v.querySelector('h1')).fontSize,overflow:document.documentElement.scrollWidth>innerWidth,scroll:scrollY,grid:rect(v.querySelector('${id==='prepareView'?'.genre-grid':'#gallery'}'))};
    })()`);
    const prepare=await measure('prepareView');
    await evaluate("document.getElementById('prepareNextBtn').click()"); await delay(100);
    assert.ok((await evaluate("document.getElementById('shotBtn').textContent")).includes('샘플 포스터 보기'));
    await evaluate("document.getElementById('shotBtn').click()");
    for(let i=0;i<100;i++){if(await evaluate("document.body.dataset.step==='3'"))break;await delay(100);}
    assert.equal(await evaluate('document.body.dataset.step'),'3');
    await delay(2400);
    // 정렬 결함을 주입했을 때 실제로 검사가 막는지 확인한다.
    if(process.argv.includes('--selftest')) await evaluate("document.getElementById('resultView').style.gridTemplateColumns='50% 50%'");
    const result=await measure('resultView');
    assert.equal(result.overflow,false,`${width}: 가로 넘침`);
    assert.equal(result.scroll,0,`${width}: 공통 헤더 유지`);
    assert.equal(result.font,prepare.font,`${width}: 제목 크기`);
    const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1,`${width}: ${label}: ${a} vs ${b}`);
    near(result.workspace.x,prepare.workspace.x,'좌우 비율');
    near(result.heading.x,prepare.heading.x,'제목 왼쪽 정렬');
    near(result.grid.x,prepare.grid.x,'목록 왼쪽 정렬');
    near(result.grid.width,prepare.grid.width,'목록 전체 폭');
    if(width>=1100 && height>=700){
      near(result.heading.y,prepare.heading.y,'제목 위쪽 정렬');
      near(result.button.y,prepare.button.y,'하단 버튼');
      near(result.button.height,prepare.button.height,'버튼 높이');
      assert.ok(result.button.bottom<=height,`${width}: 화면 안 출력 버튼`);
      assert.ok(result.grid.bottom<=result.dock.y,`${width}: 목록과 버튼 겹침 없음`);
    }
    assert.equal(await evaluate("document.querySelectorAll('#gallery .style-option').length"),8);
    const hashes=new Set();
    for(let i=0;i<8;i++){
      await evaluate(`document.querySelectorAll('#gallery .style-option')[${i}].click()`); await delay(50);
      hashes.add(await evaluate("document.getElementById('posterCanvas').toDataURL()"));
    }
    assert.equal(hashes.size,8,'8개 디자인 선택');
    await evaluate("document.querySelector('#gallery .style-option').click()"); await delay(100);
    const shot=await call('Page.captureScreenshot',{format:'png'});
    await fs.writeFile(path.join(out,`result-${width}.png`),Buffer.from(shot.data,'base64'));
    reports.push({width,height,prepare,result});
  }
  assert.equal(requests.filter(u=>/cloudfunctions|run\.app|api\.openai/.test(u)).length,0);
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(reports,null,2));
  console.log(JSON.stringify({viewports:reports.length,styles:8,evidence:out}));
  await call('Browser.close');
}finally{socket?.close();chrome.kill();}

// 샘플 페이지의 이미지·문구 겹침만 확인한다. 실제 앱/API는 열지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const out = path.resolve('.cache/robot-samples-layout');
await fs.mkdir(out, { recursive: true });
const selftest = process.argv.includes('--selftest');
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
  const results=[];
  for(const width of [1920,1280,390]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:5523/samples.html'});
    for(let i=0;i<50;i++){if(await evaluate('document.querySelectorAll(".card").length===12'))break;await delay(100);}
    await evaluate(`(async()=>{await document.fonts.ready;for(const i of document.images)i.loading='eager';await Promise.all([...document.images].map(i=>i.decode()));})()`);
    for(const expanded of [false,true]){
      await evaluate(`document.querySelectorAll('details').forEach(d=>d.open=${expanded})`);
      if(selftest)await evaluate(`document.querySelector('.media img').style.top='400px'`);
      const result=await evaluate(`(()=>{const cards=[...document.querySelectorAll('.card')];const failures=[];for(const [i,c] of cards.entries()){const img=c.querySelector('img'), r=img.getBoundingClientRect(),m=c.querySelector('.media').getBoundingClientRect(),t=c.querySelector('h2').getBoundingClientRect();if(!img.naturalWidth)failures.push(i+':이미지 로드 실패');if(r.bottom>t.top||r.bottom>m.bottom+1||r.top<m.top-1)failures.push(i+':이미지와 본문 영역 겹침');const blocks=[...c.querySelector('.copy').children].filter(e=>e.getBoundingClientRect().height);for(let n=1;n<blocks.length;n++)if(blocks[n-1].getBoundingClientRect().bottom>blocks[n].getBoundingClientRect().top+1)failures.push(i+':본문 겹침');}return {textRows:cards.map(c=>Object.fromEntries(['h2','h3','.body'].map(s=>{const e=c.querySelector(s);return [s,Math.round(e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).lineHeight))]}))),cards:cards.length,images:document.images.length,failures,overflow:document.documentElement.scrollWidth>innerWidth};})()`);
      assert.equal(result.cards,12);assert.equal(result.images,12);assert.deepEqual(result.failures,[]);assert.equal(result.overflow,false);
      results.push({width,expanded,...result});
    }
    if(width===1280){const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/desktop.png`,Buffer.from(shot.data,'base64'));}
  }
  await fs.writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
  console.log(JSON.stringify({conditions:results.length,cardsChecked:results.length*12,overlaps:0}));
}finally{socket?.close();chrome.kill();}

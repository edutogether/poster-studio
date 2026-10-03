// 샘플 페이지의 이미지·문구 겹침만 확인한다. 실제 앱/API는 열지 않는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const out = path.resolve('.cache/waiting-art-layout');
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
  const results=[];
  for(const width of [390,730,1366]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:'http://127.0.0.1:5523/samples.html'});
    for(let i=0;i<50;i++){if(await evaluate('document.querySelectorAll(".waiting-art-frame").length===12'))break;await delay(100);}
    await evaluate('document.fonts.ready');
    const rows=await evaluate(`(async()=>{
      const results=[];
      for(const frame of document.querySelectorAll('.waiting-art-frame')){
        const img=frame.querySelector('img');img.loading='eager';await img.decode();
        const c=document.createElement('canvas');c.width=704;c.height=704;const x=c.getContext('2d');x.drawImage(img,0,0,704,704);const d=x.getImageData(0,0,704,704).data;
        let l=704,r=0,t=704,b=0;
        for(let y=0;y<704;y++)for(let xx=0;xx<704;xx++){const i=(y*704+xx)*4,a=[d[i],d[i+1],d[i+2]];if(Math.max(...a)<175||Math.max(...a)-Math.min(...a)>40){l=Math.min(l,xx);r=Math.max(r,xx);t=Math.min(t,y);b=Math.max(b,y);}}
        const style=getComputedStyle(frame),scale=+style.getPropertyValue('--art-scale'),dy=parseFloat(style.getPropertyValue('--art-y'))/100,dx=parseFloat(style.getPropertyValue('--art-x')||'0')/100;
        const bounds={left:(1-scale)/2+dx+scale*l/704,right:(1-scale)/2+dx+scale*r/704,top:1-scale+dy+scale*t/704,bottom:1-scale+dy+scale*b/704};
        results.push({id:frame.dataset.art,bounds,titleGap:frame.closest('.card').querySelector('h2').getBoundingClientRect().top-frame.getBoundingClientRect().bottom});
      }return results;
    })()`);
    assert.equal(rows.length,12);
    for(const row of rows){assert.ok(row.bounds.left>=0&&row.bounds.right<=1&&row.bounds.top>=0&&row.bounds.bottom<=1,JSON.stringify(row));assert.ok(Math.abs(row.bounds.bottom-.94)<.001,JSON.stringify(row));assert.ok(row.titleGap>=20,JSON.stringify(row));}
    results.push({width,scenes:rows.length,clipped:0,baselineTolerance:'0.1%'});
    if(width===1366){const shot=await call('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(out,'adjusted.png'),Buffer.from(shot.data,'base64'));}
  }
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  await call('Browser.close');
}finally{socket?.close();chrome.kill();}

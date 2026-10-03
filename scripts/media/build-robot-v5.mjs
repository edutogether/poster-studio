/* 6열×4행 생성 이미지에서 네 장면을 분리하고 바닥 위치를 맞춰 무음 루프로 인코딩한다. */
import {createCanvas,loadImage} from '@napi-rs/canvas';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const sheet=await loadImage('_docs/intents/2026-09-30-studio-design-integration/robot-studio-sprite-v5.png');
const films=['paint','desk','direct','present'];
for(let row=0;row<4;row++){
 const dir=`.cache/robot-v5/${films[row]}`;fs.mkdirSync(dir,{recursive:true});
 const cells=[];
 for(let col=0;col<6;col++){
  const cv=createCanvas(384,384),c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,384,384);
  c.drawImage(sheet,col*sheet.width/6,row*sheet.height/4,sheet.width/6,sheet.height/4,0,0,384,384);
  const {data}=c.getImageData(0,0,384,384);let bottom=0,left=384,right=0;
  for(let y=0;y<384;y++)for(let x=0;x<384;x++){const i=(y*384+x)*4;if(Math.min(data[i],data[i+1],data[i+2])<100){bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}}
  const fixed=createCanvas(384,384),f=fixed.getContext('2d');f.fillStyle='#fff';f.fillRect(0,0,384,384);f.drawImage(cv,192-(left+right)/2,352-bottom);cells.push(fixed.toBuffer('image/png'));
 }
 const order=[0,0,1,2,3,4,5,5,4,3,2,1,0,0,0,0];
 order.forEach((n,i)=>fs.writeFileSync(`${dir}/${String(i).padStart(3,'0')}.png`,cells[n]));
 const base=`public/studio/robot-${films[row]}-v5`;
 const run=args=>{const r=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('영상 인코딩 실패');};
 run(['-framerate','4','-i',`${dir}/%03d.png`,'-vf','minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1','-t','3.5','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',`${base}.mp4`]);
 run(['-i',`${dir}/000.png`,'-frames:v','1','-c:v','libwebp','-quality','94',`${base}.webp`]);
 console.log(films[row],fs.statSync(`${base}.mp4`).size);
}

// Bumm님 요청: 재생성 없이 초기 고해상도 원화에서 아이 영역만 좌우 반전한다.
import fs from 'node:fs';
import {createCanvas, loadImage} from '@napi-rs/canvas';
const root='_docs/intents/2026-09-30-studio-design-integration';
const source=`${root}/robot-logo-v11/11.png`;
const destination=`${root}/robot-logo-v18`;
fs.mkdirSync(destination,{recursive:true});
const input=await loadImage(source);
const canvas=createCanvas(input.width,input.height),ctx=canvas.getContext('2d');
ctx.drawImage(input,0,0);
const original=ctx.getImageData(0,0,input.width,input.height);
const selection=createCanvas(input.width,input.height),select=selection.getContext('2d');
// 엄마의 손·팔과 아이의 손목이 만나는 경계를 따라 아이만 선택한다.
const polygon=[[889,505],[1215,505],[1215,1140],[825,1140],[825,855],[800,808],[800,746],[846,729],[875,755],[888,755]];
select.beginPath();polygon.forEach(([x,y],i)=>i?select.lineTo(x,y):select.moveTo(x,y));select.closePath();select.fill();
const mask=select.getImageData(0,0,input.width,input.height).data;
const output=ctx.getImageData(0,0,input.width,input.height);
const axisSum=2040;
for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){
  const i=(y*input.width+x)*4;
  if(mask[i+3]){const b=(y*input.width+1240)*4;output.data.set(original.data.subarray(b,b+4),i);}
}
for(let y=0;y<input.height;y++)for(let x=0;x<input.width;x++){
  const i=(y*input.width+x)*4;if(!mask[i+3])continue;
  const toX=axisSum-x;if(toX<0||toX>=input.width)continue;
  const j=(y*input.width+toX)*4;
  // 반사된 빈 배경이 선택 밖의 엄마를 덮지 않도록 밝은 배경은 생략한다.
  const min=Math.min(original.data[i],original.data[i+1],original.data[i+2]);
  if(min>251)continue;
  const opacity=Math.min(1,Math.max(0,(251-min)/16));for(let k=0;k<3;k++)output.data[j+k]=Math.round(original.data[i+k]*opacity+output.data[j+k]*(1-opacity));output.data[j+3]=255;
}
// 겹쳐 잡고 있던 엄마의 손은 원본 픽셀로 복원한다.
for(let y=0;y<808;y++)for(let x=0;x<875;x++){const i=(y*input.width+x)*4;if(Math.min(original.data[i],original.data[i+1],original.data[i+2])<(y<780?245:100))output.data.set(original.data.subarray(i,i+4),i);}
ctx.putImageData(output,0,0);
fs.writeFileSync(`${destination}/11.png`,canvas.toBuffer('image/png'));
fs.writeFileSync(`${destination}/11-edit-prompt.txt`,'재생성 없음. robot-logo-v11/11.png의 아이 영역을 선택해 동일한 오른쪽 위치에서 좌우 반전. 원본 해상도와 픽셀 색상 유지. scripts/media/flip-robot-child.mjs 참조.\n');
console.log(JSON.stringify({source,output:`${destination}/11.png`,width:input.width,height:input.height,method:'원본 픽셀 좌우 반전'}));

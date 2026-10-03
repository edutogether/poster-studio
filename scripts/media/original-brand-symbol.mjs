// Bumm님이 요청한 원본 심벌 추출: 글자 제외·흰 배경 투명화, 도형/색 재생성 없음.
import fs from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
export async function extractSymbol(source) {
  const img=await loadImage(`${source}/logo-reference.png`);
  const height=Math.floor(img.height*.61);
  const cv=createCanvas(img.width,height),ctx=cv.getContext('2d');
  ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,img.width,height);
  let left=img.width,right=-1,top=height,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<img.width;x++){
    const i=(y*img.width+x)*4;
    const rgb=pixels.data.slice(i,i+3);
    if(Math.max(...rgb)-Math.min(...rgb)<5||Math.min(...rgb)>248){pixels.data[i+3]=0;continue;}
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left)throw Error('원본 심벌을 찾지 못했습니다.');
  ctx.putImageData(pixels,0,0);
  const symbol=createCanvas(right-left+1,bottom-top+1);
  symbol.getContext('2d').drawImage(cv,left,top,symbol.width,symbol.height,0,0,symbol.width,symbol.height);
  fs.writeFileSync(`${source}/brand-symbol.png`,symbol.toBuffer('image/png'));
  return symbol;
}
export function placeSymbol(ctx,symbol,index){
  // 생성 시 빈칸으로 만든 제품의 실제 표면에 원본 PNG를 작게 배치한다.
  const positions={2:[437,405,48,-3],9:[355,290,38,9],10:[100,303,24,-20],11:[583,446,26,0]};
  const p=positions[index];if(!p)return;
  const [x,y,width,deg]=p,height=width*symbol.height/symbol.width;
  ctx.save();ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.translate(x,y);ctx.rotate(deg*Math.PI/180);ctx.drawImage(symbol,-width/2,-height/2,width,height);ctx.restore();
}

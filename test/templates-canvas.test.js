// TEMPLATES 8종을 실제 캔버스(@napi-rs/canvas, 미리 빌드된 바이너리 — node-gyp/Visual
// Studio 빌드툴 불필요)로 렌더링해 진짜 픽셀 출력을 검증한다. 기존
// templates.test.js(FakeCtx)는 "예외 없이 끝나는가"만 봤고 실제 그림이 나오는지는
// 못 봤다 — 이 파일은 그 빈틈을 메운다: 완성된 PNG가 실제로 텍스트/이미지 픽셀을
// 담고 있는지(완전히 빈 캔버스로 끝나지 않는지)를 픽셀 샘플링으로 확인한다.
import { test, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { loadApp } from './load-app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 자체호스팅 중인 Pretendard만 등록 — Black Han Sans/Noto Serif KR/Bebas Neue는
// Google Fonts CDN 전용이라 이 오프라인 테스트 환경엔 없다. 등록 안 된 글꼴은
// napi-rs canvas가 시스템 기본 글꼴로 대체해서 그리므로 렌더 자체는 실패하지 않는다
// (진짜 목적은 타이포그래피 정확성이 아니라 "실제 캔버스 파이프라인이 텍스트/이미지를
// 픽셀로 만들어내는가"이다).
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'public', 'fonts', 'Pretendard-Bold.woff2'), 'PretendardFull');
GlobalFonts.registerFromPath(path.join(__dirname, '..', 'public', 'fonts', 'Pretendard-Black.woff2'), 'PretendardFull');

const app = await loadApp({ createRealCanvas: createCanvas });
const { W, H } = app;
const GENRE_STUB = { font: "'Pretendard'", accent: '#ffd23f', taglines: ['테스트 문구'] };

function makeFakeArt() {
  // coverDraw()가 drawImage()에 넘길 수 있는 실제 이미지가 필요 — 작은 캔버스를
  // 색으로 채워 "촬영된 인물 사진" 자리에 대신 넣는다.
  const art = createCanvas(400, 600);
  const actx = art.getContext('2d');
  const g = actx.createLinearGradient(0, 0, 0, 600);
  g.addColorStop(0, '#4466aa');
  g.addColorStop(1, '#112244');
  actx.fillStyle = g;
  actx.fillRect(0, 0, 400, 600);
  return art;
}

const META = {
  mode: 'solo',
  name: '김인키',
  title: '나의 첫 영화',
  tagline: '오늘 완성한 이야기',
  genre: 'animation'
};

function countNonBackgroundPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const first = [data[0], data[1], data[2]];
  let diff = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== first[0] || data[i + 1] !== first[1] || data[i + 2] !== first[2]) diff++;
  }
  return diff;
}

for (const template of app.TEMPLATES) {
  test(`TEMPLATES[${template.label}].render(): 실제 캔버스에 빈 화면이 아닌 픽셀을 그린다`, () => {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const art = makeFakeArt();

    expect(() => {
      template.render(ctx, art, META, GENRE_STUB);
    }).not.toThrow();

    const diffPixels = countNonBackgroundPixels(canvas);
    // 배경색 한 가지로만 끝났다면(diffPixels===0) 사진/텍스트가 전혀 안 그려진
    // 것 — 최소한 캔버스 크기(1200×1800=2,160,000px)의 1%는 배경과 달라야
    // "실제로 뭔가 그려졌다"고 볼 수 있다.
    expect(diffPixels > W * H * 0.01, `배경과 다른 픽셀이 너무 적음(${diffPixels}px) — 사진/텍스트가 안 그려졌을 가능성`).toBeTruthy();
  });
}

test('8종 디자인의 긴 제목·단체명·출연진도 글자끼리 겹치거나 인화지 밖으로 나가지 않는다', () => {
  const cases=[META,{...META,title:'우주를 건너 별들의 바다로 떠나는 아주 길고 긴 모험 이야기',mode:'group',groupName:'햇살초등학교 영화 동아리',members:'김인키 · 이영화 · 박감독 · 최배우 · 정연출 · 한제작'}, {...META,title:'가'.repeat(30)}];
  for(const template of app.TEMPLATES)for(const meta of cases){
    const canvas=createCanvas(W,H),ctx=canvas.getContext('2d'),texts=[];
    const draw=ctx.fillText.bind(ctx);
    ctx.fillText=(text,x,y,maxWidth)=>{
      if(text){const m=ctx.measureText(text),matrix=ctx.getTransform();
        const corners=[[x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent],[x+m.actualBoundingBoxRight,y-m.actualBoundingBoxAscent],[x-m.actualBoundingBoxLeft,y+m.actualBoundingBoxDescent],[x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent]].map(([a,b])=>({x:matrix.a*a+matrix.c*b+matrix.e,y:matrix.b*a+matrix.d*b+matrix.f}));
        texts.push({text,left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.y)),bottom:Math.max(...corners.map(p=>p.y))});
      }draw(text,x,y,maxWidth);
    };
    template.render(ctx,makeFakeArt(),meta,GENRE_STUB);
    for(let i=0;i<texts.length;i++){
      const a=texts[i];expect(a.left>=0&&a.right<=W&&a.top>=0&&a.bottom<=H,`${template.label}: 인화지 밖 ${a.text}`).toBe(true);
      for(const b of texts.slice(i+1))expect(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1,`${template.label}: 겹침 ${a.text} / ${b.text}`).toBe(false);
    }
  }
});

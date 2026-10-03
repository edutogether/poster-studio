/** 그림 한 장을 서로 다른 면적·여백·프레임으로 조판하는 8종 디자인. */
import { FEST, DATE, VENUE, W, H, type Genre } from './constants.js';
import { state, type Meta } from './state.js';
import { coverDraw, setLS, roundRect, drawOrgLogo } from './layout.js';

export function creditMain(m: Meta) { return m.mode === 'group' ? m.groupName : `주연 · 감독   ${m.name}`; }
export function creditSub(m: Meta) { return m.mode === 'group' && m.members ? `출연  ${m.members}` : ''; }
export interface Template {
  label: string;
  render(ctx: CanvasRenderingContext2D, art: HTMLImageElement, m: Meta, g: Genre): void;
}
const sans = "'PretendardFull', sans-serif";
const serif = "'Noto Serif KR', serif";
type Ctx = CanvasRenderingContext2D;

function line(c: Ctx, text: string, x: number, y: number, size: number, color: string | CanvasGradient,
  weight = 500, width = 1024, family = sans, align: CanvasTextAlign = 'center', tracking = 0) {
  c.save(); c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color;
  setLS(c, tracking);
  c.font = `${weight} ${size}px ${family}`;
  while (c.measureText(text).width > width && size > 8) { size -= 1; c.font = `${weight} ${size}px ${family}`; }
  c.fillText(text, x, y, width); c.restore();
}

/** 2줄 안에서 실제 글자 폭을 재며 맞춘다. 그림자·굵은 외곽선 없이 조판한다. */
function title(c: Ctx, text: string, y: number, color: string | CanvasGradient, size = 126, weight = 800,
  family = sans, align: CanvasTextAlign = 'center', tracking = 0, width = 1024, stacked = false, maxHeight = Infinity) {
  c.save(); setLS(c, tracking);
  let lines = [text];
  const wordCuts = new Set(Array.from(text.matchAll(/\s+/g), match => match.index));
  for (; size > 12; size -= 2) {
    c.font = `${weight} ${size}px ${family}`;
    if ((!stacked || text.length < 5) && c.measureText(text).width <= width) { lines = [text]; break; }
    // 짧은 제목은 한 줄을 유지하고, 긴 제목만 균형 있게 두 줄로 나눈다.
    if (!stacked && size > 88) continue;
    let best: string[] = []; let score = Infinity;
    for (let i = 1; i < text.length; i++) {
      if (wordCuts.size && !wordCuts.has(i)) continue;
      const a = text.slice(0, i).trim(), b = text.slice(i).trim();
      const aw = c.measureText(a).width, bw = c.measureText(b).width;
      if (!a || !b || Math.max(aw, bw) > width) continue;
      const next = Math.abs(aw - bw);
      if (next <= score) { score = next; best = [a, b]; }
    }
    if (best.length) { lines = best; break; }
  }
  // 대체 명조 글꼴은 같은 px에서도 실제 한글 높이가 다르다. 제목 전용 세로
  // 영역도 측정해 긴 두 줄이 아래 크레딧으로 침범하지 않게 한다.
  c.textBaseline = 'middle';
  while (size > 12 && Number.isFinite(maxHeight)) {
    c.font = `${weight} ${size}px ${family}`;
    const fits = lines.every((value, i) => {
      const metrics = c.measureText(value);
      const offset = (i - (lines.length - 1) / 2) * size * 1.18;
      return offset - (metrics.actualBoundingBoxAscent ?? size / 2) >= -maxHeight / 2
        && offset + (metrics.actualBoundingBoxDescent ?? size / 2) <= maxHeight / 2;
    });
    if (fits) break;
    size -= 2;
  }
  c.restore();
  const x = align === 'left' ? 88 : W / 2;
  lines.forEach((value, i) => line(c, value, x, y + (i - (lines.length - 1) / 2) * size * 1.18,
    size, color, weight, width, family, align, tracking));
}
function image(c: Ctx, art: HTMLImageElement, x=0, y=0, w=W, h=H) {
  c.save(); roundRect(c, x, y, w, h, 0); c.clip(); coverDraw(c, art, x, y, w, h, .35); c.restore();
}
/** 배경을 평평한 색으로 가리지 않고 아래까지 그림의 질감을 남긴다. */
function shade(c: Ctx, color: string, start=1040, strength=.86) {
  const gradient=c.createLinearGradient(0,start,0,H);
  gradient.addColorStop(0,'transparent'); gradient.addColorStop(1,color);
  c.save();c.globalAlpha=strength;c.fillStyle=gradient;c.fillRect(0,start,W,H-start);c.restore();
}
function brands(c: Ctx, dark=false) {
  const color=dark?'#222':'#fff';
  if (!dark) {
    const gradient=c.createLinearGradient(0,0,0,240);
    gradient.addColorStop(0,'#0009');gradient.addColorStop(1,'transparent');
    c.fillStyle=gradient;c.fillRect(0,0,W,240);
  }
  // 우상단 앱 로고와 같은 노란 영화 카메라 부분을 같은 원본에서 가져온다.
  if(state.LOGO_FESTIVAL)c.drawImage(state.LOGO_FESTIVAL,120,0,145,90,64,53,93,58);
  line(c,'InKY',173,86,32,color,800,94,sans,'left');
  line(c,'Film Festival',257,86,32,color,400,220,sans,'left');
  const logo=dark?state.LOGO_DARK:state.LOGO_LIGHT;
  const ratio=logo?.naturalWidth && logo.naturalHeight?logo.naturalWidth/logo.naturalHeight:3.8;
  c.save();c.shadowColor=color;c.shadowBlur=1.4;
  drawOrgLogo(c,W-64-72*ratio/2,86,72,dark?'dark':'light');c.restore();
}
function credits(c: Ctx, m: Meta, y: number, color: string, align: CanvasTextAlign='center') {
  const x=align==='left'?88:600;
  line(c,creditMain(m),x,y,33,color,600,1024,sans,align);
  if(creditSub(m))line(c,creditSub(m),x,y+43,25,color,400,1024,sans,align);
}
function footer(c: Ctx, color='#dcebf3', dark=false) {
  // 기존 상단 중앙 문구의 27px·600·자간 2px을 하단 한 곳으로 옮긴다.
  line(c,FEST,600,1670,27,color,600,1056,sans,'center',2);
  line(c,`${DATE}  ·  ${VENUE}`,600,1726,28,dark?'#38342d':'#fff',700);
}
function paper(c: Ctx, color: string) { c.fillStyle=color; c.fillRect(0,0,W,H); }
function rule(c: Ctx, y: number, color: string, x=72, w=1056) { c.fillStyle=color;c.fillRect(x,y,w,2); }

export const TEMPLATES: Template[] = [
  { label:'시네마', render(c,art,m) {
    image(c,art);shade(c,'#06101a',940,.98);
    line(c,m.tagline,600,1245,31,'#e8e6dc',500,1000,sans,'center',2);
    title(c,m.title,1380,'#fff',156,900,sans,'center',-3);
    rule(c,1485,'#d9c297',510,180);
    credits(c,m,1544,'#eee9db');brands(c);footer(c,'#ddd7c8');
  }},
  { label:'에디토리얼', render(c,art,m) {
    paper(c,'#f4f0e7');brands(c,true);rule(c,156,'#252b28');
    title(c,m.title,314,'#19392f',132,900,sans,'left',-5,1024,true);
    line(c,m.tagline,88,486,30,'#455448',500,1024,sans,'left');
    image(c,art,80,524,1040,962);
    c.fillStyle='#19392f';c.fillRect(80,1510,72,7);
    credits(c,m,1560,'#26362f','left');rule(c,1640,'#b4bbae');footer(c,'#384c40',true);
  }},
  { label:'컬러 블록', render(c,art,m) {
    paper(c,'#f9d949');brands(c,true);
    image(c,art,48,170,1104,1120);
    c.fillStyle='#143cc0';c.beginPath();c.moveTo(0,1218);c.lineTo(W,1314);c.lineTo(W,H);c.lineTo(0,H);c.closePath();c.fill();
    line(c,m.tagline,88,1338,29,'#dbe3ff',600,1024,sans,'left');
    title(c,m.title,1458,'#fff5b4',142,900,sans,'left',-4,1024);
    credits(c,m,1570,'#fff');footer(c,'#dbe3ff');
  }},
  { label:'아치 프레임', render(c,art,m) {
    paper(c,'#123930');brands(c);
    // 상단은 둥근 아치, 하단은 직선. 사진과 금색 프레임이 하나의 창을 이룬다.
    c.save();c.beginPath();c.moveTo(110,1300);c.lineTo(110,670);c.arc(600,670,490,Math.PI,Math.PI*2);c.lineTo(1090,1300);c.closePath();c.clip();
    image(c,art,110,180,980,1120);c.restore();
    c.strokeStyle='#d5ba79';c.lineWidth=3;c.beginPath();c.moveTo(92,1318);c.lineTo(92,670);c.arc(600,670,508,Math.PI,Math.PI*2);c.lineTo(1108,1318);c.closePath();c.stroke();
    line(c,m.tagline,600,1342,28,'#e1ce9f',500,1000,serif);
    title(c,m.title,1468,'#f5e3b4',128,700,serif,'center',1,1024,false,160);
    credits(c,m,1573,'#ede3cd');footer(c,'#dfcfac');
  }},
  { label:'필름스트립', render(c,art,m) {
    paper(c,'#eee9df');c.fillStyle='#171918';c.fillRect(0,0,W,1328);brands(c);
    image(c,art,150,164,900,1120);
    c.fillStyle='#eee9df';for(let y=182;y<1290;y+=94){roundRect(c,58,y,44,56,9);c.fill();roundRect(c,1098,y,44,56,9);c.fill();}
    line(c,m.tagline,600,1353,28,'#54564f',500);
    title(c,m.title,1470,'#1b211e',128,900,sans,'center',-4);
    credits(c,m,1596,'#39423b');footer(c,'#455045',true);
  }},
  { label:'폴라로이드', render(c,art,m) {
    paper(c,'#bd392c');brands(c);
    c.save();c.translate(600,775);c.rotate(-.045);c.translate(-600,-775);
    c.save();c.shadowColor='#43181155';c.shadowBlur=28;c.shadowOffsetY=12;
    c.fillStyle='#fffaf0';c.fillRect(130,194,940,1145);c.restore();
    image(c,art,163,227,874,970);
    line(c,m.tagline,600,1262,30,'#554e43',500,826,serif);
    c.restore();
    title(c,m.title,1468,'#fff9e9',128,700,serif,'center',-1,1024,false,160);
    credits(c,m,1570,'#fff4df');footer(c,'#ffe4cc');
  }},
  { label:'타이포그래피', render(c,art,m) {
    paper(c,'#ff744c');brands(c,true);rule(c,158,'#252622');
    title(c,m.title,342,'#192821',154,900,sans,'left',-7,1024,true);
    line(c,m.tagline,88,554,30,'#23362b',600,1024,sans,'left');
    image(c,art,0,590,1200,1020);shade(c,'#10241b',1280,1);
    credits(c,m,1565,'#fff0da','left');footer(c,'#f6d1ab');
  }},
  { label:'트립틱', render(c,art,m) {
    paper(c,'#edf0e7');brands(c,true);
    line(c,m.tagline,600,222,29,'#385347',500,1024,serif);
    image(c,art,64,285,1072,1040);
    // 한 장의 이미지를 이어지는 세 폭으로 나눈다. 각 폭을 반복하거나 인물을 복제하지 않는다.
    c.fillStyle='#edf0e7';c.fillRect(409,285,18,1040);c.fillRect(773,285,18,1040);
    rule(c,1370,'#617c68',64,1072);
    title(c,m.title,1454,'#243d30',130,700,serif,'center',2);
    credits(c,m,1578,'#39513f');footer(c,'#4c6352',true);
  }},
];

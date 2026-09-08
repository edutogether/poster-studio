/* ────────────────────────────────────────────────────────────────────
   레이아웃/그리기 공통 도구 — 폰트 준비, 캔버스 측정·타이틀 줄바꿈,
   비네트/필름그레인, 교육청 로고. templates.js의 TEMPLATES가 이 파일의
   함수들을 그대로 사용한다. app.js 분리 작업(2026-08-30)으로 이 파일로
   이동, 이어서 ES모듈 전환(2026-08-30) — 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */
import { FEST, DATE, VENUE, EN } from './constants.js';
import { state } from './state.js';

/* ── 폰트 보장(캔버스는 폰트 로드 후 그려야 깨지지 않음) ── */
export async function ensureFonts(){
  try{
    await Promise.all([
      document.fonts.load("900 120px 'Black Han Sans'"),
      document.fonts.load("900 120px 'Noto Serif KR'"),
      document.fonts.load("700 60px 'Noto Serif KR'"),
      document.fonts.load("400 80px 'Bebas Neue'"),
      document.fonts.load("800 40px 'Pretendard'"),
      document.fonts.load("900 40px 'Pretendard'"),
    ]);
    await document.fonts.ready;
  }catch(e){ /* 폰트 못 받아도 기본글꼴로 진행 */ }
}
/* 실제로 그릴 글자(제목·이름·문구 등)의 글꼴 조각을 미리 모두 로드.
   구글폰트 한글은 subset으로 쪼개 받아서, 안 받은 글자가 기본글꼴로 깨질 수 있음 → 텍스트 인자로 강제 로드 */
export async function ensureGlyphs(meta){
  const txt = [meta.title, meta.name, meta.groupName, meta.members, meta.tagline, FEST, DATE, VENUE]
    .filter(Boolean).join(' ') + ' 주연감독출연';
  const jobs = [];
  for(const fam of ["Black Han Sans","Noto Serif KR","Pretendard"]){
    for(const w of [400,500,700,800,900]){
      try{ jobs.push(document.fonts.load(`${w} 80px '${fam}'`, txt)); }catch(e){}
    }
  }
  try{ jobs.push(document.fonts.load("400 60px 'Bebas Neue'", EN)); }catch(e){}
  try{ await Promise.all(jobs); await document.fonts.ready; }catch(e){}
}

/* ───────────────────── 그리기 공통 도구 ───────────────────── */
export function loadImg(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
export function coverDraw(ctx, img, x,y,w,h, alignY=0.5){
  const s = Math.max(w/img.width, h/img.height);
  const iw=img.width*s, ih=img.height*s;
  ctx.drawImage(img, x+(w-iw)/2, y+(h-ih)*alignY, iw, ih);
}
export function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
export function vignette(ctx,w,h,strength=0.55){
  const g=ctx.createRadialGradient(w/2,h*0.42,h*0.2,w/2,h*0.5,h*0.75);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${strength})`);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}
let grainTile=null;
export function grain(ctx,w,h,alpha=0.06){
  if(!grainTile){ const t=document.createElement('canvas'); t.width=t.height=128; const tc=t.getContext('2d');
    const id=tc.createImageData(128,128); for(let i=0;i<id.data.length;i+=4){ const v=Math.random()*255; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255; } tc.putImageData(id,0,0); grainTile=t; }
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation='overlay';
  const p=ctx.createPattern(grainTile,'repeat'); ctx.fillStyle=p; ctx.fillRect(0,0,w,h); ctx.restore();
}
export function setLS(ctx,px){ try{ ctx.letterSpacing = px+'px'; }catch(e){} }
/* 한 줄 텍스트가 maxW를 넘으면 폰트를 줄여 잘림 방지(긴 단체명·출연진·문구 대비) */
export function setFitFont(ctx, weight, px, family, text, maxW){
  let s = px; ctx.font = `${weight} ${s}px ${family}`;
  while(s > 16 && ctx.measureText(text).width > maxW){ s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

/* 제목 레이아웃: 한 줄 시도 → 안 되면 두 줄(균형 분할) */
export function layoutTitle(ctx, text, font, maxW, maxSize, minSize){
  for(let s=maxSize;s>=minSize;s-=3){ ctx.font=`900 ${s}px ${font}`; if(ctx.measureText(text).width<=maxW) return {lines:[text], size:s}; }
  // 두 줄: 띄어쓰기 우선, 없으면 가운데 글자에서 분할
  let cut = text.lastIndexOf(' ', Math.ceil(text.length/2));
  if(cut<=0) cut = text.indexOf(' ', Math.floor(text.length/2));
  if(cut<=0) cut = Math.ceil(text.length/2);
  const a=text.slice(0,cut).trim(), b=text.slice(cut).trim();
  for(let s=maxSize;s>=minSize;s-=3){ ctx.font=`900 ${s}px ${font}`;
    if(ctx.measureText(a).width<=maxW && ctx.measureText(b).width<=maxW) return {lines:[a,b], size:s}; }
  return {lines:[a,b], size:minSize};
}
export function drawTitle(ctx, text, font, cx, cy, maxW, maxSize, minSize, fill, stroke=true){
  const L = layoutTitle(ctx, text, font, maxW, maxSize, minSize);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const lh = L.size*1.06, startY = cy - (L.lines.length-1)*lh/2;
  ctx.font = `900 ${L.size}px ${font}`;
  L.lines.forEach((ln,i)=>{
    const y = startY + i*lh;
    if(stroke){ ctx.lineJoin='round'; ctx.strokeStyle='rgba(0,0,0,.82)'; ctx.lineWidth=L.size*0.15; ctx.strokeText(ln,cx,y); }
    ctx.save(); ctx.shadowColor='rgba(0,0,0,.55)'; ctx.shadowBlur=L.size*0.18;
    ctx.fillStyle = fill; ctx.fillText(ln,cx,y); ctx.restore();
  });
  return startY + (L.lines.length-1)*lh + L.size*0.6; // 아래 끝 y
}
/* 인천광역시교육청 로고: 흰글씨(어두운 배경용)·짙은글씨(밝은 배경용) 각각 로드 */
export async function ensureLogo(){
  if(state.LOGO_TRIED) return; state.LOGO_TRIED = true;
  try{ state.LOGO_LIGHT = await loadImg('logo-white.png'); }catch(e){ state.LOGO_LIGHT = null; }
  try{ state.LOGO_DARK  = await loadImg('logo-dark.png'); }catch(e){ state.LOGO_DARK = null; }
}
/* 로고를 (cx, cy) 중심에 높이 h로 그린다. variant: 'light'(흰글씨) | 'dark'(짙은글씨), 받침 없음 */
export function drawOrgLogo(ctx, cx, cy, h, variant){
  const img = variant === 'dark' ? state.LOGO_DARK : state.LOGO_LIGHT;
  if(!img) return;
  const ar = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth/img.naturalHeight : 3.8;
  const w = h*ar;
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);
}

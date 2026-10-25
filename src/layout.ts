/* ────────────────────────────────────────────────────────────────────
   레이아웃/그리기 공통 도구 — 폰트 준비, 캔버스 측정·타이틀 줄바꿈,
   비네트/필름그레인, 교육청 로고. templates.js의 TEMPLATES가 이 파일의
   함수들을 그대로 사용한다. app.js 분리 작업(2026-08-30)으로 이 파일로
   이동, 이어서 ES모듈 전환(2026-08-30) — 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */
import { FEST, DATE, VENUE, EN } from './constants.js';
import { state, type Meta } from './state.js';
import FULL_CORE from './fullFontCore.json';

/* ── 폰트 보장(캔버스는 폰트 로드 후 그려야 깨지지 않음) ── */
export async function ensureFonts(){
  try{
    await Promise.allSettled([
      document.fonts.load("900 120px 'Black Han Sans'"),
      document.fonts.load("900 120px 'Noto Serif KR'"),
      document.fonts.load("700 60px 'Noto Serif KR'"),
      document.fonts.load("400 80px 'Bebas Neue'"),
      document.fonts.load("800 40px 'PretendardFull'"),
      document.fonts.load("900 40px 'PretendardFull'"),
      // 2026-10-14 포스터 다시 설계: 폴라로이드 캡션 손글씨(Gaegu 700), 타이포그래피 세로 제목(Song Myung)
      document.fonts.load("700 80px 'Gaegu'"),
      document.fonts.load("400 80px 'Song Myung'"),
    ]);
    await ensureFullFallback();
    await document.fonts.ready;
  }catch(e){ /* 폰트 못 받아도 기본글꼴로 진행 */ }
}
/* PretendardFull(핵심 조각)에 없는 글자만 골라낸다 — scripts/fonts/slice-full.py와 같은 정의다:
   KS X 1001 상용 한글 2350자 + fullFontCore.json의 범위. 나머지는 PretendardFullRare의 구간 조각에 있다(2026-10-24).
   글 전체를 넘기면 상용 음절이 구간마다 걸려 조각을 거의 다 받게 되므로, 드문 글자만 넘긴다. */
const CORE_RANGES = FULL_CORE.ranges.map((r) => r.split('-').map((x) => parseInt(x, 16)));
let commonSyllables: Set<number> | null = null;
export function rareGlyphs(text: string){
  if(!commonSyllables){
    const bytes: number[] = [];
    for(let lead = 0xb0; lead <= 0xc8; lead++) for(let trail = 0xa1; trail <= 0xfe; trail++) bytes.push(lead, trail);
    commonSyllables = new Set([...new TextDecoder('euc-kr').decode(Uint8Array.from(bytes))].map((c) => c.codePointAt(0)!));
  }
  const out = new Set<string>();
  for(const ch of text){
    const cp = ch.codePointAt(0)!;
    if(!commonSyllables.has(cp) && !CORE_RANGES.some(([a, b]) => a <= cp && cp <= b)) out.add(ch);
  }
  return [...out].join('');
}
const SANS_WEIGHTS = [400,500,600,700,800,900];

/* 포스터 글꼴 조각(핵심 PretendardFull · 드문 PretendardFullRare)을 망 오류로 못 받은 굵기는, 조각을 잘라낸 원본 통글꼴
   (public/fonts/Pretendard-*.woff2 — 그대로 둔다)을 같은 이름 'PretendardFull' · 같은 굵기로 더해 받는다. 같은 설명의 글꼴은
   나중에 넣은 것이 앞서므로 그 굵기의 모든 글자를 원본에서 그리고, 조각은 원본에서 잘라낸 것이라 모양이 같다 — 대체 글꼴로
   인쇄되지 않게 한다(2026-10-26). 정상일 때는 받지 않는다. 원본을 세 번(0.5초 · 1초 간격) 못 받으면 그 부름에서는 대체 글꼴로
   그려질 수 있지만, 실패는 기억하지 않는다 — 생성 단추에서 미리 부른 첫 시도가 망 오류로 끝나도 조판 때 다시 부르면 새로 받는다(10/26 종합감사). */
const FULL_FILE: Record<number, string> = {400:'Regular',500:'Medium',600:'SemiBold',700:'Bold',800:'ExtraBold',900:'Black'};
const fullFallback = new Map<number, Promise<boolean>>();
async function loadFullFallback(w: number){
  for(let attempt = 0; attempt < 3; attempt++){
    if(attempt) await new Promise((r) => setTimeout(r, 500 * attempt));
    // 문서 기준 상대 주소(로고 loadImg와 같다) — 하위 경로로 열어도 이 앱의 fonts/를 가리킨다
    const face = new FontFace('PretendardFull', `url('fonts/Pretendard-${FULL_FILE[w]}.woff2') format('woff2')`, { weight: String(w), style: 'normal', display: 'block' });
    try{ await face.load(); document.fonts.add(face); return true; }catch(e){ /* 다시 받는다 */ }
  }
  // 문구는 화면 글꼴 서브셋에 있는 글자로만 쓴다 — 글자 집합 추출기(scripts/fonts/charset.mjs)가 src의 문자열을 화면 문구로 센다
  console.warn(`[포스터 글자] ${w} 원본 파일도 받지 못했다 — 다른 글자로 그려질 수 있다`);
  return false;
}
export async function ensureFullFallback(){
  const failed = new Set<number>();
  try{
    document.fonts.forEach((f) => {
      const fam = f.family.replace(/["']/g, '');
      if((fam === 'PretendardFull' || fam === 'PretendardFullRare') && f.status === 'error') failed.add(Number(f.weight));
    });
  }catch(e){ return; }
  await Promise.all([...failed].filter((w) => FULL_FILE[w]).map((w) => {
    if(!fullFallback.has(w)) fullFallback.set(w, loadFullFallback(w).then((ok) => { if(!ok) fullFallback.delete(w); return ok; }));
    return fullFallback.get(w);
  }));
}

/* 실제로 그릴 글자(제목·이름·문구 등)의 글꼴 조각을 미리 모두 로드.
   구글폰트 한글은 subset으로 쪼개 받아서, 안 받은 글자가 기본글꼴로 깨질 수 있음 → 텍스트 인자로 강제 로드 */
export async function ensureGlyphs(meta: Meta){
  const txt = [meta.title, meta.name, meta.groupName, meta.members, meta.tagline, FEST, DATE, VENUE]
    .filter(Boolean).join(' ') + ' 주연감독출연';
  const jobs = [];
  const rare = rareGlyphs(txt);
  for(const fam of ["Black Han Sans","Noto Serif KR","PretendardFull"]){
    /* 600(SemiBold)이 빠져 있었다 — templates의 클래식 판이 출연진 줄을 600으로
       그린다. 폰트 서브셋 전에는 화면 UI가 이미 Pretendard 600을 받아둔 덕에
       우연히 문제가 안 났는데, 캔버스를 별도 패밀리(PretendardFull)로 가르자
       **그 줄만 대체 글꼴로 그려졌다** — master에서 포스터 픽셀 대조 20건 중
       1건 불일치로 잡힌 것이다(2026-09-09). */
    for(const w of SANS_WEIGHTS){
      try{ jobs.push(document.fonts.load(`${w} 80px '${fam}'`, txt)); }catch(e){}
    }
  }
  if(rare) for(const w of SANS_WEIGHTS){
    try{ jobs.push(document.fonts.load(`${w} 80px 'PretendardFullRare'`, rare)); }catch(e){}
  }
  // 손글씨·세로 제목 글꼴은 굵기가 하나뿐이라 그 굵기로만 받는다(2026-10-14).
  for(const face of ["700 80px 'Gaegu'", "400 80px 'Song Myung'"]){
    try{ jobs.push(document.fonts.load(face, txt)); }catch(e){}
  }
  try{ jobs.push(document.fonts.load("400 60px 'Bebas Neue'", EN + ' 0123456789+')); }catch(e){}
  // 하나가 실패해도 나머지를 다 기다린다(Promise.all은 첫 실패에서 끝나 아직 받는 글꼴 없이 그리기 시작했다) — 그 뒤 실패한 굵기는 원본으로
  await Promise.allSettled(jobs);
  await ensureFullFallback();
  try{ await document.fonts.ready; }catch(e){}
}

/* ───────────────────── 그리기 공통 도구 ───────────────────── */
export function loadImg(src: string): Promise<HTMLImageElement> { return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
export function roundRect(ctx: CanvasRenderingContext2D,x: number,y: number,w: number,h: number,r: number){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
let grainTile: HTMLCanvasElement | null = null;
export function grain(ctx: CanvasRenderingContext2D,w: number,h: number,alpha=0.06){
  if(!grainTile){ const t=document.createElement('canvas'); t.width=t.height=128; const tc=t.getContext('2d')!;
    const id=tc.createImageData(128,128); for(let i=0;i<id.data.length;i+=4){ const v=Math.random()*255; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255; } tc.putImageData(id,0,0); grainTile=t; }
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation='overlay';
  const p=ctx.createPattern(grainTile,'repeat')!; ctx.fillStyle=p; ctx.fillRect(0,0,w,h); ctx.restore();
}
export function setLS(ctx: CanvasRenderingContext2D,px: number){ try{ ctx.letterSpacing = px+'px'; }catch(e){} }
/* 한 줄 텍스트가 maxW를 넘으면 폰트를 줄여 잘림 방지(긴 단체명·출연진·문구 대비) */
export function setFitFont(ctx: CanvasRenderingContext2D, weight: number, px: number, family: string, text: string, maxW: number){
  let s = px; ctx.font = `${weight} ${s}px ${family}`;
  while(s > 16 && ctx.measureText(text).width > maxW){ s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

/* 인천광역시교육청 로고: 흰글씨(어두운 배경용)·짙은글씨(밝은 배경용) 각각 로드.
   세 장을 한꺼번에 받고, 받는 중에 다시 불려도 같은 약속을 돌려준다 — 생성 단추에서 미리 부른 뒤
   조판에서 또 부르므로, 먼저 끝난 척 돌아가면 로고 없이 그려진다(2026-10-24). */
let logoJob: Promise<void> | null = null;
export function ensureLogo(): Promise<void> {
  if(state.LOGO_TRIED) return logoJob ?? Promise.resolve();
  state.LOGO_TRIED = true;
  const one = (src: string) => loadImg(src).catch(() => null);
  logoJob = Promise.all([one('logo-white.png'), one('logo-dark.png'), one('studio/inky-logo.png')])
    .then(([light, dark, festival]) => {
      state.LOGO_LIGHT = light; state.LOGO_DARK = dark; state.LOGO_FESTIVAL = festival;
      // 하나라도 못 받았으면 다음 부름(조판 때)에 다시 받는다 — 미리 부른 첫 시도의 망 오류로 로고 없이 인쇄되지 않게(10/26 종합감사)
      if(!light || !dark || !festival) state.LOGO_TRIED = false;
    });
  return logoJob;
}
/* 로고를 (cx, cy) 중심에 높이 h로 그린다. variant: 'light'(흰글씨) | 'dark'(짙은글씨), 받침 없음 */
export function drawOrgLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, variant: string){
  const img = variant === 'dark' ? state.LOGO_DARK : state.LOGO_LIGHT;
  if(!img) return;
  const ar = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth/img.naturalHeight : 3.8;
  const w = h*ar;
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);
}

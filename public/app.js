/* ====================================================================
   InKY AI 영화 포스터 제작소 — 합성/타이포 엔진
   서버가 만든 'AI 그림(글자 없음)' 위에, 여기서 장르별 한글 타이포·
   영화 크레딧·월계관·필름그레인을 입혀 4가지 고퀄 버전을 만든다.
   ==================================================================== */

/* AI 생성은 더 이상 이 노트북 안 서버가 아니라 Firebase Functions(서버리스)가 처리한다.
   Firebase 프로젝트를 새로 만들거나 옮기면 이 URL이 바뀐다 — 그럴 땐 아래 두 곳을
   반드시 같이 고칠 것(한쪽만 고치면 CORS가 막히거나 엉뚱한 프로젝트를 호출하게 됨):
     1. 이 줄의 API_BASE
     2. functions/index.js의 ALLOWED_ORIGINS (지금 이 페이지 도메인이 그 목록에 있어야
        Functions가 브라우저 요청을 허용한다) */
const API_BASE = 'https://asia-northeast3-inky-poster-studio.cloudfunctions.net/posterStudio';

/* 부스 공유 토큰 — functions/index.js의 BOOTH_TOKEN 시크릿과 같은 값이어야 한다.
   정적 사이트라 이 값은 누구나 소스에서 볼 수 있다(진짜 비밀이 아니다) — 목적은
   자동화 스크립트가 소스를 안 보고 /generate URL만 찔러보는 걸 막는 최소한의
   문지기이지, 강한 인증이 아니다. 교체 절차는 RUNBOOK.md "부스토큰 교체" 참고.
   2026-08-30: 5차 감사에서 이전 값이 예측 가능한 패턴이라는 지적을 받아 무작위
   문자열로 교체함(무작위 자체가 보안을 강하게 만들진 않지만, 최소한 "부스 이름을
   안다"는 정보만으로는 더 이상 추측할 수 없게 함). */
const BOOTH_TOKEN = 'XQp4tQ97rS_fUPz4zgCEBTYnUEOs48C0';

const FEST   = '제4회 인천어린이청소년영화제';
const DATE   = '2026. 11. 14. (토)';
const VENUE  = 'CGV 인천';
const EN      = 'INKY  ·  INCHEON KIDS & YOUTH FILM FESTIVAL';

/* 장르별 컨셉: 제목 폰트(한글 가능)·강조색·자동 추천 홍보문구 */
const GENRES = {
  animation:{ font:"'Black Han Sans'", accent:'#ffd23f', taglines:['상상은 현실이 된다','오늘, 가장 신나는 모험','웃음과 용기가 가득한 이야기'] },
  fantasy:  { font:"'Noto Serif KR'", accent:'#f6d27a', taglines:['전설이 깨어난다','마법의 문이 열린다','운명을 향한 모험의 시작'] },
  sf:       { font:"'Black Han Sans'", accent:'#7fe7ff', taglines:['우주 너머, 미지의 세계로','별을 향한 위대한 도약','내일을 여는 탐험가'] },
  hero:     { font:"'Black Han Sans'", accent:'#ff6b6b', taglines:['세상을 지키는 작은 영웅','용기가 가장 큰 힘이다','지금, 영웅이 깨어난다'] },
  mystery:  { font:"'Noto Serif KR'", accent:'#d7c79a', taglines:['진실을 쫓는 명탐정','단 하나의 단서','수수께끼가 시작된다'] },
  director: { font:"'Noto Serif KR'", accent:'#ffd23f', taglines:['카메라 뒤, 또 하나의 주인공','나의 첫 영화가 시작된다','세상을 담는 한 컷'] },
  sports:   { font:"'Black Han Sans'", accent:'#ffae3b', taglines:['포기하지 않는 한, 끝이 아니다','함께라서 더 빛난다','한계를 넘어'] },
  music:    { font:"'Black Han Sans'", accent:'#ff8fe0', taglines:['오늘 밤, 무대의 주인공','마음을 울리는 한 곡','빛나는 순간이 시작된다'] }
};

const $ = id => document.getElementById(id);
const val = id => ($(id)?.value || '').trim();
const pick = arr => arr[Math.floor(Math.random()*arr.length)];

const video = $('video'), snapshot = $('snapshot');
const posterCanvas = $('posterCanvas'), pctx = posterCanvas.getContext('2d');
let stream = null, capturedBlob = null;
let currentMode = 'solo';
let posters = [];        // [{label, canvas}]
let LOGO_LIGHT = null, LOGO_DARK = null, LOGO_TRIED = false;  // 교육청 로고(흰글씨/짙은글씨)
let selected = 0;

function setStatus(m){ $('status').textContent = m; }

/* AI 서버(Firebase Functions) 연결 상태를 미리 확인한다.
   촬영·정보입력을 다 마친 뒤에야 실패를 알게 되는 것보다, 부스 진행자가
   페이지를 여는 순간 바로 문제를 알 수 있는 게 훨씬 낫다. 실패해도 촬영
   자체는 막지 않는다(연결이 잠깐 불안정했을 수도 있으므로 fail-open). */
(async function checkHealth(){
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if(!r.ok) throw new Error('unhealthy');
    const data = await r.json().catch(() => ({}));
    // 5차 감사 발견: 예전엔 HTTP 상태만 봐서, /health가 "키는 있음"만 확인하고
    // OpenAI가 실제로 죽어있어도 이 경고가 안 떴다 — 응답 본문의 openaiReachable도 확인한다.
    if(data.openaiReachable === false){
      setStatus('⚠ AI(OpenAI) 서버에 연결할 수 없습니다. 잠시 후 다시 열어보거나 담당자에게 알려주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)');
    }
  }catch(e){
    setStatus('⚠ AI 서버 연결을 확인할 수 없습니다. 와이파이를 확인해 주세요. (촬영은 가능하지만 포스터 생성이 실패할 수 있어요)');
  }
})();

/* ── 폰트 보장(캔버스는 폰트 로드 후 그려야 깨지지 않음) ── */
async function ensureFonts(){
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
async function ensureGlyphs(meta){
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

/* ───────────────────────── 카메라 ───────────────────────── */
async function startCamera(){
  stream = await navigator.mediaDevices.getUserMedia({ video:{ width:1280, height:960, facingMode:'user' }, audio:false });
  video.srcObject = stream;
  video.classList.remove('hidden'); snapshot.classList.add('hidden');
  $('camHint').classList.add('hidden');
  setStatus('카메라 준비 완료. ‘3·2·1 촬영’을 누르세요.');
}
$('startBtn').onclick = async () => { try{ await startCamera(); }catch(e){ setStatus('카메라를 열 수 없습니다. 브라우저 카메라 권한을 허용해 주세요.'); } };

let snapshotURL = null; // 미리보기 Blob URL(누수 방지용 추적)
$('shotBtn').onclick = async () => {
  if(!stream){ try{ await startCamera(); }catch(e){ setStatus('카메라 권한을 허용해 주세요.'); return; } }
  const cd = $('countdown'); cd.classList.remove('hidden');
  for(let i=3;i>0;i--){ cd.textContent=i; await new Promise(r=>setTimeout(r,800)); }
  cd.textContent='📸'; await new Promise(r=>setTimeout(r,250)); cd.classList.add('hidden');

  if(!video.videoWidth){ setStatus('카메라가 아직 준비 중이에요. 1~2초 후 다시 촬영해 주세요.'); return; }
  const MAXW = 1024; // 전송용 축소(AI가 스타일을 새로 그리므로 화질 손해 없음, 업로드 몇 초 단축)
  const scale = Math.min(1, MAXW / video.videoWidth);
  const cap = document.createElement('canvas');
  cap.width = Math.round(video.videoWidth * scale); cap.height = Math.round(video.videoHeight * scale);
  const c = cap.getContext('2d');
  c.translate(cap.width,0); c.scale(-1,1);           // 거울 모드(셀카 느낌)
  c.drawImage(video,0,0,cap.width,cap.height);
  cap.toBlob(blob => {
    if(!blob){ setStatus('촬영에 실패했어요. 다시 시도해 주세요.'); return; }
    capturedBlob = blob;
    if(snapshotURL) URL.revokeObjectURL(snapshotURL);  // 이전 미리보기 메모리 해제(장시간 운영 대비)
    snapshotURL = URL.createObjectURL(blob);
    snapshot.src = snapshotURL;
    snapshot.classList.remove('hidden'); video.classList.add('hidden');
    setStatus('촬영 완료! 정보를 입력하고 ‘AI 포스터 만들기’를 누르세요.');
    genCount = 0; $('regenBtn').disabled = false; $('regenBtn').textContent = '🔄 다른 그림으로';
  }, 'image/jpeg', 0.85);
};
$('retakeBtn').onclick = () => {
  capturedBlob = null; snapshot.classList.add('hidden');
  video.classList.remove('hidden'); setStatus('다시 촬영할 수 있습니다.');
  $('fallbackBtn').classList.add('hidden'); pendingMeta = null;
  genCount = 0; $('regenBtn').disabled = false; $('regenBtn').textContent = '🔄 다른 그림으로';
};

/* ── 개인/단체 토글 ── */
$('modeSeg').querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
  currentMode = b.dataset.mode;
  $('modeSeg').querySelectorAll('.seg-btn').forEach(x=>x.classList.toggle('active', x===b));
  $('soloFields').classList.toggle('hidden', currentMode!=='solo');
  $('groupFields').classList.toggle('hidden', currentMode!=='group');
});

/* ── 메타데이터 수집 ── */
function getMeta(){
  const genre = val('genre') || 'animation';
  let tagline = val('tagline'); if(!tagline) tagline = pick(GENRES[genre].taglines);
  return {
    mode: currentMode,
    name: val('studentName') || '인키',
    groupName: val('groupName') || '우리들',
    members: val('members'),
    title: val('movieTitle') || '나의 영화',
    genre, tagline
  };
}
function creditMain(m){ return m.mode==='group' ? m.groupName : `주연 · 감독   ${m.name}`; }
function creditSub(m){ return (m.mode==='group' && m.members) ? `출연  ${m.members}` : ''; }

/* AI(OpenAI) 자체가 완전히 막힌 상황(네트워크 두절·크레딧 소진·서버 장애 등)에서도
   부스 운영이 통째로 멈추지 않도록, 실패 시 AI 그림 없이(단색/그라디언트 배경)
   같은 타이포·크레딧 레이아웃으로 인쇄 가능한 버전을 만드는 최소한의 폴백. */
function makePlaceholderArt(genre){
  const c = document.createElement('canvas'); c.width=1024; c.height=1536;
  const ctx = c.getContext('2d');
  const accent = (GENRES[genre] || GENRES.animation).accent;
  const g = ctx.createLinearGradient(0,0,0,c.height);
  g.addColorStop(0, accent); g.addColorStop(1, '#0b1020');
  ctx.fillStyle = g; ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle = 'rgba(255,255,255,.10)';
  for(let i=0;i<50;i++){
    ctx.beginPath();
    ctx.arc(Math.random()*c.width, Math.random()*c.height, Math.random()*3+1, 0, Math.PI*2);
    ctx.fill();
  }
  return c.toDataURL('image/png');
}
let pendingMeta = null; // AI 생성 실패 시 폴백 버튼이 재사용할 마지막 입력값

/* 한 장의 사진(같은 capturedBlob)으로는 최초 생성 1회 + 재생성 1회, 총 2회까지만
   허용한다(2026-08-29 대표 결정) — 완전 무제한은 남용/과금 위험, 완전 금지는
   "결과가 안 좋게 나온 아이는 그대로 끝"이 되는 문제가 있어 절충한 값. 다시
   촬영하면(새 capturedBlob) 카운트가 초기화된다. */
const MAX_GENERATIONS_PER_PHOTO = 2;
let genCount = 0;

/* ───────────────────────── 생성 ───────────────────────── */
let isGenerating = false; // 이중 클릭 방지(중복 과금 차단)
$('generateBtn').onclick = async () => {
  if(isGenerating) return;
  if(!capturedBlob){ setStatus('먼저 사진을 촬영해 주세요.'); return; }
  if(genCount >= MAX_GENERATIONS_PER_PHOTO){
    setStatus('이 사진으로는 재생성 횟수를 모두 사용했어요. 다시 촬영하면 새로 만들 수 있어요.');
    return;
  }
  const meta = getMeta();
  isGenerating = true;
  genCount++;
  $('generateBtn').disabled = true; $('regenBtn').disabled = true;
  $('fallbackBtn').classList.add('hidden');
  $('spinner').classList.remove('hidden');
  setStatus('AI가 영화 포스터 그림을 그리는 중입니다… (10~25초)');
  const form = new FormData();
  form.append('photo', capturedBlob, 'capture.jpg');
  form.append('movieTitle', meta.title);
  form.append('tagline', meta.tagline);
  form.append('genre', meta.genre);
  form.append('mode', meta.mode);
  const spinText = document.querySelector('#spinner p');       // 경과 시간 표시(체감 대기 개선)
  const started = Date.now();
  const tick = setInterval(() => { if(spinText) spinText.textContent = `AI가 그리는 중… ${Math.round((Date.now()-started)/1000)}초`; }, 1000);
  const ctrl = new AbortController();                       // 요청 시간 제한(부스 무한 멈춤 방지)
  const timer = setTimeout(() => ctrl.abort(), 150_000);
  try{
    const res = await fetch(`${API_BASE}/generate`, { method:'POST', headers:{ 'x-booth-token': BOOTH_TOKEN }, body:form, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if(!res.ok) throw new Error(data.error || '생성 실패');
    await buildAll(data.images, meta);
    setStatus('완성! 아래에서 마음에 드는 버전을 고르고 인쇄하세요.');
  }catch(e){
    let msg = e.message;
    if(e.name === 'AbortError') msg = '시간이 너무 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.';
    else if(e instanceof TypeError) msg = '서버 또는 인터넷 연결을 확인해 주세요. (검은 창이 켜져 있나요? 와이파이는 연결됐나요?)';
    setStatus('오류: ' + msg + ' — 계속 안 되면 아래 "AI 없이 계속하기"로 진행할 수 있어요.');
    pendingMeta = meta;
    $('fallbackBtn').classList.remove('hidden');
  }finally{
    clearTimeout(timer);
    clearInterval(tick);
    if(spinText) spinText.textContent = 'AI가 그리는 중…';
    isGenerating = false;
    $('generateBtn').disabled = false;
    if(genCount >= MAX_GENERATIONS_PER_PHOTO){
      $('regenBtn').disabled = true;
      $('regenBtn').textContent = '🔄 재생성 횟수 소진(다시 촬영 시 초기화)';
    } else {
      $('regenBtn').disabled = false;
    }
    $('spinner').classList.add('hidden');
  }
};
$('regenBtn').onclick = () => { if(posters.length) $('generateBtn').click(); };
$('fallbackBtn').onclick = async () => {
  if(!pendingMeta || isGenerating) return;
  $('fallbackBtn').classList.add('hidden');
  setStatus('AI 없이 기본 버전을 만드는 중…');
  await buildAll([makePlaceholderArt(pendingMeta.genre)], pendingMeta);
  setStatus('AI 그림 없이 만든 기본 버전이에요(얼굴 그림은 안 들어갑니다). 인쇄는 그대로 가능해요.');
};

/* ── 그림 N장 × 템플릿 4종 = 갤러리 ── */
async function buildAll(images, meta){
  await ensureFonts();
  await ensureGlyphs(meta);
  await ensureLogo();
  const arts = await Promise.all(images.map(loadImg));
  posters = [];
  for(const art of arts){
    for(const t of TEMPLATES){
      const cv = document.createElement('canvas'); cv.width=1200; cv.height=1800;
      t.render(cv.getContext('2d'), art, meta, GENRES[meta.genre]);
      posters.push({ label:t.label, canvas:cv });
    }
  }
  renderGallery();
  select(0);
}

function renderGallery(){
  const g = $('gallery'); g.innerHTML = '';
  posters.forEach((p,i) => {
    const wrap = document.createElement('div');
    const t = document.createElement('div'); t.className='thumb'+(i===selected?' active':'');
    const img = document.createElement('img'); img.src = p.canvas.toDataURL('image/png');
    t.appendChild(img); t.onclick = () => select(i);
    const lab = document.createElement('div'); lab.className='label'; lab.textContent = p.label;
    wrap.appendChild(t); wrap.appendChild(lab); g.appendChild(wrap);
  });
}
function select(i){
  selected = i;
  pctx.clearRect(0,0,1200,1800);
  pctx.drawImage(posters[i].canvas, 0,0);
  document.querySelectorAll('.gallery .thumb').forEach((el,idx)=>el.classList.toggle('active', idx===i));
}

/* ───────────────────── 그리기 공통 도구 ───────────────────── */
function loadImg(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=src; }); }
function coverDraw(ctx, img, x,y,w,h, alignY=0.5){
  const s = Math.max(w/img.width, h/img.height);
  const iw=img.width*s, ih=img.height*s;
  ctx.drawImage(img, x+(w-iw)/2, y+(h-ih)*alignY, iw, ih);
}
function roundRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function vignette(ctx,w,h,strength=0.55){
  const g=ctx.createRadialGradient(w/2,h*0.42,h*0.2,w/2,h*0.5,h*0.75);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,`rgba(0,0,0,${strength})`);
  ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
}
let grainTile=null;
function grain(ctx,w,h,alpha=0.06){
  if(!grainTile){ const t=document.createElement('canvas'); t.width=t.height=128; const tc=t.getContext('2d');
    const id=tc.createImageData(128,128); for(let i=0;i<id.data.length;i+=4){ const v=Math.random()*255; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255; } tc.putImageData(id,0,0); grainTile=t; }
  ctx.save(); ctx.globalAlpha=alpha; ctx.globalCompositeOperation='overlay';
  const p=ctx.createPattern(grainTile,'repeat'); ctx.fillStyle=p; ctx.fillRect(0,0,w,h); ctx.restore();
}
function setLS(ctx,px){ try{ ctx.letterSpacing = px+'px'; }catch(e){} }
/* 한 줄 텍스트가 maxW를 넘으면 폰트를 줄여 잘림 방지(긴 단체명·출연진·문구 대비) */
function setFitFont(ctx, weight, px, family, text, maxW){
  let s = px; ctx.font = `${weight} ${s}px ${family}`;
  while(s > 16 && ctx.measureText(text).width > maxW){ s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

/* 제목 레이아웃: 한 줄 시도 → 안 되면 두 줄(균형 분할) */
function layoutTitle(ctx, text, font, maxW, maxSize, minSize){
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
function drawTitle(ctx, text, font, cx, cy, maxW, maxSize, minSize, fill, stroke=true){
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
async function ensureLogo(){
  if(LOGO_TRIED) return; LOGO_TRIED = true;
  try{ LOGO_LIGHT = await loadImg('logo-white.png'); }catch(e){ LOGO_LIGHT = null; }
  try{ LOGO_DARK  = await loadImg('logo-dark.png'); }catch(e){ LOGO_DARK = null; }
}
/* 로고를 (cx, cy) 중심에 높이 h로 그린다. variant: 'light'(흰글씨) | 'dark'(짙은글씨), 받침 없음 */
function drawOrgLogo(ctx, cx, cy, h, variant){
  const img = variant === 'dark' ? LOGO_DARK : LOGO_LIGHT;
  if(!img) return;
  const ar = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth/img.naturalHeight : 3.8;
  const w = h*ar;
  ctx.drawImage(img, cx - w/2, cy - h/2, w, h);
}
/* ───────────────────────── 템플릿 4종 ───────────────────────── */
const W=1200, H=1800;
/* var(const 아님) — 테스트(public/test/load-app.js)가 vm 샌드박스에서 이 값을
   꺼내 4가지 템플릿의 render()를 직접 호출해 검증할 수 있게 하기 위함.
   런타임 동작은 const와 동일(재할당 없음). */
var TEMPLATES = [
  /* 1) 클래식 시네마 */
  { label:'클래식', render(ctx,art,m,g){
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,W,H);
    coverDraw(ctx,art,0,0,W,H);
    const gr=ctx.createLinearGradient(0,820,0,H); gr.addColorStop(0,'rgba(5,7,15,0)');
    gr.addColorStop(.42,'rgba(5,7,15,.72)'); gr.addColorStop(1,'rgba(5,7,15,.98)');
    ctx.fillStyle=gr; ctx.fillRect(0,800,W,1000);
    vignette(ctx,W,H,.5); grain(ctx,W,H,.05);
    ctx.textAlign='center'; ctx.fillStyle=g.accent; setLS(ctx,2);
    ctx.font="800 38px 'Pretendard'"; ctx.fillText(FEST, W/2, 1066); setLS(ctx,0);
    const yEnd = drawTitle(ctx, `${m.title}`, g.font, W/2, 1212, 1000, 130, 60, '#fff');
    ctx.fillStyle=g.accent; setFitFont(ctx,800,46,"'Pretendard'",creditMain(m),1080); ctx.fillText(creditMain(m), W/2, Math.max(yEnd+40,1360));
    const sub=creditSub(m); let y=Math.max(yEnd+40,1360);
    if(sub){ ctx.fillStyle='#dfe5f3'; setFitFont(ctx,600,32,"'Pretendard'",sub,1080); ctx.fillText(sub, W/2, y+50); y+=50; }
    ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(300,y+95); ctx.lineTo(900,y+95); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font="800 42px 'Pretendard'"; ctx.fillText(`${DATE}   ${VENUE}`, W/2, y+155);
    ctx.fillStyle=g.accent; setLS(ctx,4); ctx.font="400 30px 'Bebas Neue'"; ctx.fillText(EN, W/2, y+215); setLS(ctx,0);
    drawOrgLogo(ctx, W/2, 1758, 40, 'light');
  }},

  /* 2) 타이틀 임팩트 */
  { label:'임팩트', render(ctx,art,m,g){
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,W,H);
    coverDraw(ctx,art,0,0,W,H);
    const gr=ctx.createLinearGradient(0,1000,0,H); gr.addColorStop(0,'rgba(5,7,15,0)'); gr.addColorStop(1,'rgba(5,7,15,.92)');
    ctx.fillStyle=gr; ctx.fillRect(0,1000,W,800); grain(ctx,W,H,.05);
    const tg = `“${m.tagline}”`;
    ctx.textAlign='center'; ctx.fillStyle='#fff'; setFitFont(ctx,700,36,"'Pretendard'",tg,1060);
    ctx.save(); ctx.shadowColor='rgba(0,0,0,.7)'; ctx.shadowBlur=12; ctx.fillText(tg, W/2, 1300); ctx.restore();
    // 그라데이션 골드 제목
    const L=layoutTitle(ctx, m.title, g.font, 1060, 150, 66);
    const lh=L.size*1.04, baseY=1330+L.size*0.7, cx=W/2;
    ctx.font=`900 ${L.size}px ${g.font}`; ctx.textBaseline='middle';
    L.lines.forEach((ln,i)=>{ const y=baseY+i*lh;
      ctx.lineJoin='round'; ctx.strokeStyle='rgba(0,0,0,.85)'; ctx.lineWidth=L.size*0.16; ctx.strokeText(ln,cx,y);
      const gg=ctx.createLinearGradient(0,y-L.size/2,0,y+L.size/2); gg.addColorStop(0,'#fff7df'); gg.addColorStop(.5,g.accent); gg.addColorStop(1,'#c9912a');
      ctx.fillStyle=gg; ctx.fillText(ln,cx,y); });
    const endY=baseY+(L.lines.length-1)*lh;
    ctx.fillStyle='#fff'; setFitFont(ctx,800,40,"'Pretendard'",creditMain(m),1080); ctx.fillText(creditMain(m), W/2, endY+L.size*0.7+30);
    drawOrgLogo(ctx, W/2, 1648, 34, 'light');
    // 하단 골드 띠
    const bar=H-92; ctx.fillStyle=g.accent; ctx.fillRect(0,bar,W,92);
    const barLine = `${FEST}   ·   ${DATE}   ·   ${VENUE}`;
    ctx.fillStyle='#2a1d00'; setFitFont(ctx,800,30,"'Pretendard'",barLine,1140);
    ctx.fillText(barLine, W/2, bar+50);
  }},

  /* 3) 시네마스코프 — 사진은 자르지 않고 검은 띠를 위에 덧씌움(머리 잘림 방지) */
  { label:'시네마', render(ctx,art,m,g){
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,W,H);
    coverDraw(ctx,art,0,0,W,H);          // 전체 꽉 채움(2:3 동일비율 → 잘림 없음)
    grain(ctx,W,H,.05);
    const top=210, botY=H-340;           // 상단 띠 0~210, 하단 띠 1460~1800
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,top); ctx.fillRect(0,botY,W,H-botY);
    ctx.strokeStyle=g.accent; ctx.globalAlpha=.85; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(80,top); ctx.lineTo(W-80,top); ctx.moveTo(80,botY); ctx.lineTo(W-80,botY); ctx.stroke(); ctx.globalAlpha=1;
    // 상단 띠: 영화제명
    ctx.textAlign='center'; ctx.fillStyle=g.accent; setLS(ctx,3); ctx.font="800 38px 'Pretendard'"; ctx.fillText(FEST, W/2, 104); setLS(ctx,0);
    ctx.fillStyle='#9aa3bd'; setLS(ctx,5); ctx.font="400 24px 'Bebas Neue'"; ctx.fillText(EN, W/2, 156); setLS(ctx,0);
    // 하단 띠: 제목/크레딧/날짜/로고
    const yEnd=drawTitle(ctx, m.title, g.font, W/2, botY+100, 1020, 94, 50, '#fff');
    ctx.fillStyle=g.accent; setFitFont(ctx,800,36,"'Pretendard'",creditMain(m),1060); ctx.fillText(creditMain(m), W/2, yEnd+28);
    ctx.fillStyle='#cfd6e8'; ctx.font="700 30px 'Pretendard'"; ctx.fillText(`${DATE}   ${VENUE}`, W/2, yEnd+70);
    drawOrgLogo(ctx, W/2, 1772, 30, 'light');
  }},


  /* 4) 포토카드(기념 프레임) */
  { label:'포토카드', render(ctx,art,m,g){
    ctx.fillStyle='#f3e9d2'; ctx.fillRect(0,0,W,H);
    grain(ctx,W,H,.04);
    const ix=90, iy=96, iw=W-180, ih=1180;
    ctx.save(); roundRect(ctx,ix,iy,iw,ih,26); ctx.clip(); coverDraw(ctx,art,ix,iy,iw,ih,0.12); ctx.restore();
    roundRect(ctx,ix,iy,iw,ih,26); ctx.strokeStyle='rgba(40,30,10,.25)'; ctx.lineWidth=3; ctx.stroke();
    ctx.save(); roundRect(ctx,ix+8,iy+8,iw-16,ih-16,20); ctx.strokeStyle=g.accent; ctx.lineWidth=2; ctx.globalAlpha=.8; ctx.stroke(); ctx.restore();
    const navy='#10183a';
    ctx.textAlign='center'; ctx.fillStyle=g.accent==='#fff'?'#b8902f':g.accent; setLS(ctx,2);
    ctx.font="800 32px 'Pretendard'"; ctx.fillText(FEST, W/2, 1356); setLS(ctx,0);
    const yEnd=drawTitle(ctx, m.title, "'Noto Serif KR'", W/2, 1440, 980, 104, 54, navy, false);
    ctx.strokeStyle=g.accent; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(W/2-80,yEnd+8); ctx.lineTo(W/2+80,yEnd+8); ctx.stroke();
    ctx.fillStyle=navy; setFitFont(ctx,700,40,"'Noto Serif KR'",creditMain(m),960); ctx.fillText(creditMain(m), W/2, yEnd+62);
    let y=yEnd+62; const sub=creditSub(m);
    if(sub){ ctx.fillStyle='#41506f'; setFitFont(ctx,500,27,"'Pretendard'",sub,980); ctx.fillText(sub, W/2, y+44); y+=44; }
    ctx.fillStyle='#41506f'; ctx.font="700 33px 'Pretendard'"; ctx.fillText(`${DATE}   ·   ${VENUE}`, W/2, y+58); y+=58;
    drawOrgLogo(ctx, W/2, Math.min(y+64, 1762), 38, 'dark');
  }},
];

/* ───────────────────────── 출력 ───────────────────────── */
$('downloadBtn').onclick = () => {
  if(!posters.length){ setStatus('먼저 포스터를 만들어 주세요.'); return; }
  const a=document.createElement('a');
  a.download=`InKY_영화포스터_${posters[selected].label}_${Date.now()}.png`;
  a.href=posters[selected].canvas.toDataURL('image/png'); a.click();
};
$('printBtn').onclick = () => {
  if(!posters.length){ setStatus('먼저 포스터를 만들어 주세요.'); return; }
  let area=$('printArea'); if(area) area.remove();
  area=document.createElement('div'); area.id='printArea';
  const img=document.createElement('img'); img.src=posters[selected].canvas.toDataURL('image/png');
  area.appendChild(img); document.body.appendChild(area);
  img.onload=()=>{ window.print(); };
};
window.addEventListener('afterprint', ()=>{ const a=$('printArea'); if(a) a.remove(); });

/* ── 초기 플레이스홀더 ── */
(function placeholder(){
  pctx.fillStyle='#0b1020'; pctx.fillRect(0,0,W,H);
  pctx.fillStyle='#e9b949'; pctx.textAlign='center'; pctx.font="900 84px 'Black Han Sans', sans-serif";
  pctx.fillText('🎬', W/2, 760); pctx.fillStyle='#f4f6fb';
  pctx.font="900 56px 'Black Han Sans', sans-serif"; pctx.fillText('AI 영화 포스터', W/2, 880);
  pctx.fillStyle='#aeb7d0'; pctx.font="500 30px sans-serif"; pctx.fillText('촬영 후 이곳에 4가지 버전이 표시됩니다', W/2, 950);
})();

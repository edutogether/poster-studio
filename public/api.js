/* ────────────────────────────────────────────────────────────────────
   메타데이터 수집 + Firebase Functions(/generate) 호출 + 결과로 갤러리
   빌드. app.js 분리 작업(2026-08-30)으로 이 파일로 이동됨 — 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */

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

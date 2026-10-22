/* global CSS, Option, localStorage, confirm */
/* Poster Studio 화면 편집판(2026-10-23 Bumm님, 팀장 전달) — 실제 앱 화면을 갈래별 기준 크기로 띄우고, 화면 위에서만 고쳐 «바꾼 목록»을 JSON으로 내보낸다.
   앱 코드는 바꾸지 않는다. 바꾼 것은 이 브라우저에 저장되고(localStorage), «내보내기» 파일을 세션에 주면 세션이 비율 단위로 코드에 옮긴다. */
(() => {
  const CLASSES = {
    pc: { label: 'PC', w: 2560, h: 1440 },
    'tablet-l': { label: '태블릿 가로', w: 1366, h: 1024 },
    'tablet-p': { label: '태블릿 세로', w: 1024, h: 1366 },
    phone: { label: '휴대폰', w: 390, h: 844 },
  };
  const SCREENS = [
    ['splash', '시작 화면(로고)'], ['first', '첫 페이지'], ['step1', '1단계 · 영화 준비'], ['pre-solo', '2단계 · 찍기 전 · 개인'], ['pre-group', '2단계 · 찍기 전 · 단체'],
    ['live', '2단계 · 카메라 켠 뒤'], ['shot', '2단계 · 찍은 뒤'], ['loading', '로딩'], ['result', '3단계 · 포스터 고르기'], ['save', '저장'],
  ];
  const KEY = 'ps-editor-ops-v1';
  const $ = (id) => document.getElementById(id);
  const app = $('app'), stage = $('stage'), sizer = $('sizer'), wrap = $('wrap'), statusEl = $('status');
  let cls = 'pc', screen = 'first', zoom = 0.5, mode = 'edit', sel = null, busy = false, editingText = null, textBefore = null;
  let ops = [];
  try { ops = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { ops = []; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ops)); } catch { /* 저장 못 해도 화면 편집은 된다 */ } renderList(); };
  const status = (t, bad) => { statusEl.textContent = t; statusEl.classList.toggle('bad', !!bad); };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ───── 갈래 · 화면 고르기 ─────
  for (const [k, c] of Object.entries(CLASSES)) $('cls').add(new Option(`${c.label} ${c.w}×${c.h}`, k));
  for (const [k, t] of SCREENS) $('screen').add(new Option(t, k));
  $('cls').value = cls; $('screen').value = screen;
  $('cls').onchange = () => { cls = $('cls').value; if (fitting) fit(); load(); };
  $('screen').onchange = () => { screen = $('screen').value; load(); };
  $('reload').onclick = () => load();

  // ───── 보기 크기 ─────
  const applyZoom = () => {
    const c = CLASSES[cls];
    app.style.width = c.w + 'px'; app.style.height = c.h + 'px';
    stage.style.transform = `scale(${zoom})`;
    sizer.style.width = c.w * zoom + 'px'; sizer.style.height = c.h * zoom + 'px';
    $('zLabel').textContent = Math.round(zoom * 100) + '%';
    try { doc()?.documentElement.style.setProperty('--ps-k', String(1 / zoom)); } catch { /* 앱이 아직 안 떴다 */ }
  };
  // «맞춤»은 창 크기가 바뀌어도 계속 맞춘다. 창이 아직 안 그려져 폭이 0이면 그려진 뒤(resize)에 맞춘다
  let fitting = true;
  const fit = () => {
    fitting = true;
    const c = CLASSES[cls], w = wrap.clientWidth - 32, h = wrap.clientHeight - 32;
    if (w > 40 && h > 40) zoom = Math.min(1, w / c.w, h / c.h);
    applyZoom();
  };
  const setZoom = (z) => { fitting = false; zoom = z; applyZoom(); };
  $('zFit').onclick = fit;
  $('z100').onclick = () => setZoom(1);
  $('zIn').onclick = () => setZoom(Math.min(2, +(zoom * 1.25).toFixed(3)));
  $('zOut').onclick = () => setZoom(Math.max(0.05, +(zoom / 1.25).toFixed(3)));

  // ───── 편집 / 앱 조작 ─────
  const setMode = (m) => { mode = m; $('modeEdit').classList.toggle('on', m === 'edit'); $('modeApp').classList.toggle('on', m === 'app'); if (m === 'app') select(null); hover(null); };
  $('modeEdit').onclick = () => setMode('edit');
  $('modeApp').onclick = () => setMode('app');

  // ───── 앱을 그 화면까지 데려가기 ─────
  const doc = () => app.contentDocument, win = () => app.contentWindow;
  // 창이 가려진 동안은 앱의 카운트다운 · 애니메이션이 멈추므로 그 시간은 세지 않는다
  const waitFor = async (fn, what, ms = 15000) => { for (let i = 0; i < ms / 100;) { try { if (fn()) return; } catch { /* 아직 */ } await delay(100); if (!document.hidden) i++; } throw new Error(what); };
  const q = (s) => doc().querySelector(s);
  const click = (s) => { const el = q(s); if (!el) throw new Error('단추를 못 찾음: ' + s); el.click(); };
  const videoOn = () => { const v = q('#video'); return v && !v.classList.contains('hidden') && v.videoWidth > 0; };
  const shown = (s) => { const el = q(s); return el && !el.hidden && el.offsetParent !== null; };
  async function drive() {
    if (screen === 'splash') { await waitFor(() => q('#splash'), '시작 화면'); await doc().fonts.ready; await delay(1000); return; }
    await waitFor(() => q('#prepareNextBtn') && !q('#splash'), '첫 화면', 25000);
    await doc().fonts.ready; await delay(500);
    if (screen === 'first') return;
    if (screen === 'step1') { if (cls === 'phone') { click('.preview-panel'); await delay(1200); } else win().scrollTo(0, doc().scrollingElement.scrollHeight); return; }
    q(screen === 'pre-group' ? '[data-mode="group"]' : '[data-mode="solo"]').click();
    click('#prepareNextBtn');
    await waitFor(() => !q('#cameraView').hidden, '2단계');
    await delay(1200); win().scrollTo(0, 0);
    if (screen === 'pre-solo' || screen === 'pre-group') return;
    const phone = cls === 'phone';
    if (screen === 'live') {
      if (phone) {   // 휴대폰은 원형 단추가 켜고 바로 찍는다 — 찍은 뒤 «다시 찍기»로 기다리는 켠 화면을 만든다
        click('#phoneShotBtn');
        await waitFor(() => shown('#generateBtn'), '촬영', 20000);
        await waitFor(() => !q('.captured-badge, .camera-capture-notice'), '촬영 완료 표시', 6000);
        click('#retakeBtn');
        await waitFor(() => videoOn() && q('#countdown').classList.contains('hidden'), '다시 켠 카메라');
      } else { click('#startBtn'); await waitFor(videoOn, '카메라 켜짐'); }
      await delay(800); return;
    }
    if (phone) click('#phoneShotBtn'); else { click('#startBtn'); await waitFor(videoOn, '카메라 켜짐'); await delay(300); click('#shotBtn'); }
    await waitFor(() => shown('#generateBtn'), '촬영', 20000);
    await waitFor(() => !q('.captured-badge, .camera-capture-notice'), '촬영 완료 표시', 6000);
    if (screen === 'shot') return;
    if (screen === 'loading') { win().__psHoldGenerate = true; click('#generateBtn'); await waitFor(() => q('#spinner')?.open, '로딩'); await delay(1500); return; }
    click('#generateBtn');
    await waitFor(() => !q('#resultView').hidden, '3단계', 60000);
    await delay(3000); win().scrollTo(0, 0);
    if (screen === 'result') return;
    const saveBtn = q('#saveBtn');
    if (saveBtn && win().getComputedStyle(saveBtn).display !== 'none') { win().__psFreeze = true; saveBtn.click(); await waitFor(() => q('.save-hint'), '저장 안내', 5000); }
    else return ' ⚠ 이 갈래에는 «저장» 화면이 따로 없습니다(PC · 태블릿은 «이 포스터로 출력하기»로 인쇄) — 3단계 화면을 띄웠습니다.';
  }

  // 여는 동안에는 갈래 · 화면 · 다시 열기를 잠근다 — 앱을 단추로 몰고 가는 중에 다른 화면을 열면 두 흐름이 한 앱을 같이 누른다
  const lock = (on) => { for (const id of ['cls', 'screen', 'reload']) $(id).disabled = on; };
  async function load() {
    if (busy) return;
    busy = true; lock(true); select(null);
    const c = CLASSES[cls];
    applyZoom();
    status(`${c.label} ${c.w}×${c.h} · ${SCREENS.find((s) => s[0] === screen)[1]} 여는 중…`);
    app.onload = null;
    await new Promise((r) => { app.onload = r; app.src = `/?__class=${cls}&__screen=${screen}&t=${Date.now()}`; });
    try {
      const note = (await drive()) || '';
      installOverlay();
      const missing = applyOps();
      status(`${c.label} ${c.w}×${c.h} · ${SCREENS.find((s) => s[0] === screen)[1]} — 요소를 눌러 고르고, 끌어서 옮기고, 모서리로 크기를 바꿉니다. Del 숨기기 · Ctrl+Z 되돌리기 · 방향키 1px(Shift 10px).${missing ? ` ⚠ 앞서 바꾼 것 ${missing}개는 이 화면에서 요소를 못 찾았습니다.` : ''}${note}`);
    } catch (e) {
      status(`이 화면까지 가지 못했습니다: ${e.message}에서 멈춤. «다시 열기»를 눌러 보세요.`, true);
      try { installOverlay(); } catch { /* 앱이 아직 안 떴다 */ }
    }
    busy = false; lock(false);
  }

  // ───── 요소 이름 · 주소 ─────
  const OWN = '__ps';
  const own = (el) => el && (el.id === OWN + '-ov' || el.closest?.('#' + OWN + '-ov'));
  function selectorOf(el) {
    const parts = [];
    for (let e = el; e && e.nodeType === 1 && e !== doc().body && e !== doc().documentElement; e = e.parentElement) {
      if (e.id) { parts.unshift('#' + CSS.escape(e.id)); break; }
      const tag = e.tagName.toLowerCase();
      const sibs = [...e.parentElement.children].filter((x) => x.tagName === e.tagName);
      parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${sibs.indexOf(e) + 1})` : tag);
    }
    return parts.join(' > ');
  }
  function describe(el) {
    const cl = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const t = (el.getAttribute('aria-label') || (el.children.length < 3 ? el.innerText || el.textContent : '') || el.getAttribute('alt') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : cl}${t ? ` «${t}»` : ''}`;
  }

  // ───── 앱 위 덧그림(고른 테두리 · 모서리 손잡이) ─────
  let ov, hv, box, tag;
  function installOverlay() {
    const d = doc();
    if (d.getElementById(OWN + '-ov')) return;
    const st = d.createElement('style');
    // 손잡이 · 이름표는 보기 배율을 거꾸로 곱해(--ps-k = 1/배율) 화면에서 늘 같은 크기로 보이게 한다 — 38%로 볼 때 12px 손잡이는 4px라 못 잡는다
    st.textContent = `#${OWN}-ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
      .${OWN}-hv{position:fixed;outline:calc(2px*var(--ps-k,1)) dashed #0ea5e9;pointer-events:none}
      .${OWN}-box{position:fixed;outline:calc(2px*var(--ps-k,1)) solid #6366f1;pointer-events:none}
      .${OWN}-h{position:absolute;box-sizing:border-box;width:calc(14px*var(--ps-k,1));height:calc(14px*var(--ps-k,1));background:#fff;border:calc(2px*var(--ps-k,1)) solid #6366f1;border-radius:calc(3px*var(--ps-k,1));pointer-events:auto}
      .${OWN}-tag{position:fixed;font:calc(12px*var(--ps-k,1))/1.4 system-ui,sans-serif;background:#4f46e5;color:#fff;padding:calc(2px*var(--ps-k,1)) calc(6px*var(--ps-k,1));border-radius:calc(4px*var(--ps-k,1));white-space:nowrap;pointer-events:none}
      [contenteditable="true"]{outline:calc(2px*var(--ps-k,1)) solid #f59e0b!important}`;
    d.head.append(st);
    d.documentElement.style.setProperty('--ps-k', String(1 / zoom));
    ov = d.createElement('div'); ov.id = OWN + '-ov';
    hv = d.createElement('div'); hv.className = OWN + '-hv'; hv.hidden = true;
    box = d.createElement('div'); box.className = OWN + '-box'; box.hidden = true;
    for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) { const k = d.createElement('div'); k.className = OWN + '-h'; k.dataset.h = h; k.style.cursor = h + '-resize'; box.append(k); }
    tag = d.createElement('div'); tag.className = OWN + '-tag'; tag.hidden = true;
    ov.append(hv, box, tag);
    d.body.append(ov);
    for (const t of ['click', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick', 'contextmenu', 'submit']) d.addEventListener(t, block, true);
    d.addEventListener('pointerdown', onDown, true);
    d.addEventListener('pointermove', onMove, true);
    d.addEventListener('pointerup', onUp, true);
    d.addEventListener('keydown', onKey, true);
    win().requestAnimationFrame(follow);
  }
  function block(e) {
    if (mode !== 'edit' || own(e.target)) return;
    if (editingText && editingText.contains(e.target)) return;   // 글자를 고치는 동안에는 그 안의 누름을 막지 않는다
    e.preventDefault(); e.stopPropagation();
  }
  const place = (el, r) => { el.style.left = r.left + 'px'; el.style.top = r.top + 'px'; el.style.width = r.width + 'px'; el.style.height = r.height + 'px'; };
  function follow() {
    if (!ov || !ov.isConnected) return;
    if (sel && sel.isConnected) {
      const r = sel.getBoundingClientRect(), half = 7 / zoom;
      box.hidden = false; place(box, r);
      for (const k of box.children) {
        const h = k.dataset.h;
        k.style.left = (h.includes('w') ? -half : h.includes('e') ? r.width - half : r.width / 2 - half) + 'px';
        k.style.top = (h.includes('n') ? -half : h.includes('s') ? r.height - half : r.height / 2 - half) + 'px';
      }
      tag.hidden = false; tag.textContent = `${describe(sel)} · ${Math.round(r.width)}×${Math.round(r.height)}`;
      tag.style.left = Math.max(0, r.left) + 'px'; tag.style.top = Math.max(0, r.top - 24 / zoom) + 'px';
    } else { box.hidden = true; tag.hidden = true; }
    win().requestAnimationFrame(follow);
  }
  function hover(el) { if (!hv) return; if (!el || el === sel || mode !== 'edit') { hv.hidden = true; return; } hv.hidden = false; place(hv, el.getBoundingClientRect()); }
  function select(el) { if (editingText) finishText(); sel = el; $('selName').textContent = el ? describe(el) : '고른 요소 없음'; }

  // ───── 끌기(옮기기) · 손잡이(크기) ─────
  let drag = null;
  const cs = (el) => win().getComputedStyle(el);
  const px = (v) => parseFloat(v) || 0;
  const translateOf = (el) => { const t = cs(el).translate; if (!t || t === 'none') return [0, 0]; const [x, y] = t.split(' '); return [px(x), px(y || '0')]; };
  function onDown(e) {
    if (mode !== 'edit') return;
    const t = e.target;
    if (editingText && editingText.contains(t)) return;
    if (t.classList?.contains(OWN + '-h') && sel) {   // 크기 바꾸기
      e.preventDefault(); e.stopPropagation();
      const r = sel.getBoundingClientRect(), s = cs(sel);
      const extraW = s.boxSizing === 'border-box' ? 0 : px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth);
      const extraH = s.boxSizing === 'border-box' ? 0 : px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
      drag = { kind: 'size', h: t.dataset.h, x: e.clientX, y: e.clientY, w: r.width, hgt: r.height, r, extraW, extraH, tr: translateOf(sel), before: { width: sel.style.width, height: sel.style.height, translate: sel.style.translate }, keep: /^(IMG|VIDEO|CANVAS)$/.test(sel.tagName) !== e.shiftKey };
      return;
    }
    if (own(t)) return;
    e.preventDefault(); e.stopPropagation();
    if (t === doc().body || t === doc().documentElement) { select(null); return; }
    if (t !== sel) select(t);
    drag = { kind: 'move', x: e.clientX, y: e.clientY, tr: translateOf(sel), before: { translate: sel.style.translate }, moved: false };
  }
  function onMove(e) {
    if (mode !== 'edit') return;
    if (!drag) { if (!own(e.target) && !(editingText && editingText.contains(e.target))) hover(e.target); return; }
    e.preventDefault();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.kind === 'move') {
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.moved = true; sel.style.translate = `${Math.round(drag.tr[0] + dx)}px ${Math.round(drag.tr[1] + dy)}px`;
    } else {
      const h = drag.h;
      let w = drag.w + (h.includes('e') ? dx : h.includes('w') ? -dx : 0);
      let hh = drag.hgt + (h.includes('s') ? dy : h.includes('n') ? -dy : 0);
      if (drag.keep && (h.length === 2)) { const k = Math.max(w / drag.w, hh / drag.hgt); w = drag.w * k; hh = drag.hgt * k; }
      w = Math.max(8, w); hh = Math.max(8, hh);
      if (h.includes('e') || h.includes('w') || drag.keep) sel.style.width = Math.round(w - drag.extraW) + 'px';
      if (h.includes('n') || h.includes('s') || drag.keep) sel.style.height = Math.round(hh - drag.extraH) + 'px';
      // 잡은 손잡이의 반대쪽 변을 제자리에 둔다 — 아래 · 가운데 정렬된 상자는 키우면 위 · 양옆으로 자라 모서리가 마우스를 안 따라온다
      sel.style.translate = `${drag.tr[0]}px ${drag.tr[1]}px`;
      const now = sel.getBoundingClientRect(), a = drag.r;
      const sx = h.includes('w') ? a.right - now.right : a.left - now.left;
      const sy = h.includes('n') ? a.bottom - now.bottom : a.top - now.top;
      sel.style.translate = `${Math.round(drag.tr[0] + sx)}px ${Math.round(drag.tr[1] + sy)}px`;
    }
  }
  function onUp() {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'move' && d.moved) record('move', { translate: [d.before.translate, sel.style.translate] });
    if (d.kind === 'size') {
      const props = {};
      for (const p of ['width', 'height', 'translate']) if (d.before[p] !== sel.style[p]) props[p] = [d.before[p], sel.style[p]];
      if (Object.keys(props).length) record('size', props, { w: d.w, h: d.hgt });
    }
  }
  function onKey(e) {
    if (mode !== 'edit') return;
    if (editingText) { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); finishText(); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); hide(); return; }
    const step = e.shiftKey ? 10 : 1, dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (dir) { e.preventDefault(); const before = sel.style.translate, [x, y] = translateOf(sel); sel.style.translate = `${x + dir[0]}px ${y + dir[1]}px`; record('move', { translate: [before, sel.style.translate] }); }
  }
  document.addEventListener('keydown', (e) => { if (doc() && document.activeElement !== app) onKey.call(null, e); });

  // ───── 도구 단추 ─────
  $('tParent').onclick = () => { if (sel?.parentElement && sel.parentElement !== doc().body) select(sel.parentElement); };
  const font = (k) => { if (!sel) return; const before = sel.style.fontSize, now = px(cs(sel).fontSize); sel.style.fontSize = Math.max(6, now + k) + 'px'; record('font', { 'font-size': [before, sel.style.fontSize] }, { from: now }); };
  $('tFontDown').onclick = () => font(-1);
  $('tFontUp').onclick = () => font(1);
  function hide() { if (!sel) return; const el = sel, before = el.style.display, r = el.getBoundingClientRect(); el.style.display = 'none'; select(null); recordOn(el, 'hide', { display: [before, 'none'] }, { rect: r }); }
  $('tHide').onclick = hide;
  $('tText').onclick = () => {
    if (editingText) { finishText(); return; }
    if (!sel || !sel.textContent.trim()) { status('글자가 든 요소를 먼저 고르세요.', true); return; }
    // 안의 구조(굵은 글씨 · 줄바꿈 · 단추 이름표)를 지키려고 글자가 아니라 HTML 통째로 전/후를 남긴다
    editingText = sel; textBefore = { text: sel.innerText, html: sel.innerHTML }; sel.contentEditable = 'true'; sel.focus();
    $('tText').classList.add('on'); $('tText').textContent = '글자 고치기 끝';
  };
  function finishText() {
    const el = editingText; if (!el) return; editingText = null;
    el.contentEditable = 'false'; el.removeAttribute('contenteditable');
    $('tText').classList.remove('on'); $('tText').textContent = '글자 고치기';
    const b = textBefore; textBefore = null;
    if (b.html !== el.innerHTML) recordOn(el, 'text', {}, { text: [b.text, el.innerText], html: [b.html, el.innerHTML] });
  }
  $('tUndo').onclick = undo;

  // ───── 기록 ─────
  const here = () => ({ cls, screen });
  function record(kind, props, extra) { recordOn(sel, kind, props, extra); }
  function recordOn(el, kind, props, extra = {}) {
    const c = CLASSES[cls], r = extra.rect || el.getBoundingClientRect();
    ops.push({ id: Date.now() + Math.random(), ...here(), size: `${c.w}x${c.h}`, selector: selectorOf(el), desc: describe(el), kind, props, text: extra.text || null, html: extra.html || null, rect: { w: Math.round(r.width), h: Math.round(r.height) }, from: extra.from ?? null, start: extra.w ? { w: Math.round(extra.w), h: Math.round(extra.h) } : null, at: new Date().toISOString() });
    save();
  }
  function setProps(el, props, which) { for (const [p, v] of Object.entries(props)) el.style.setProperty(p, v[which] || ''); }
  function undo() {
    const i = ops.map((o) => o.cls === cls && o.screen === screen).lastIndexOf(true);
    if (i < 0) { status('이 화면에서 되돌릴 것이 없습니다.'); return; }
    const o = ops[i], el = doc().querySelector(o.selector);
    if (el) { setProps(el, o.props, 0); if (o.html) el.innerHTML = o.html[0]; }
    ops.splice(i, 1); save();
  }
  function applyOps() {
    let missing = 0;
    for (const o of ops.filter((x) => x.cls === cls && x.screen === screen)) {
      const el = doc().querySelector(o.selector);
      if (!el) { missing++; continue; }
      setProps(el, o.props, 1); if (o.html) el.innerHTML = o.html[1];
    }
    return missing;
  }
  // 사람이 읽는 줄: 무엇을 · 전 → 후 · 비율(기준 폭 · 높이 대비 %)
  function human(o) {
    const c = CLASSES[o.cls], pct = (v, base) => `${(v / base * 100).toFixed(2)}%`;
    const xy = (s) => { if (!s) return [0, 0]; const [x, y] = s.split(' '); return [px(x), px(y || '0')]; };
    if (o.kind === 'move') { const [a, b] = o.props.translate.map(xy); return { 무엇을: '옮김', 전: `${a[0]}px, ${a[1]}px`, 후: `${b[0]}px, ${b[1]}px`, 비율: `가로 ${pct(b[0] - a[0], c.w)} · 세로 ${pct(b[1] - a[1], c.h)}` }; }
    if (o.kind === 'size') return { 무엇을: '크기', 전: `${o.start?.w}×${o.start?.h}px`, 후: `${o.props.width?.[1] || '그대로'} × ${o.props.height?.[1] || '그대로'}`, 비율: `폭 ${pct(px(o.props.width?.[1] || o.start?.w), c.w)} · 높이 ${pct(px(o.props.height?.[1] || o.start?.h), c.h)}` };
    if (o.kind === 'font') return { 무엇을: '글자 크기', 전: `${o.from}px`, 후: o.props['font-size'][1], 비율: `기준 폭의 ${pct(px(o.props['font-size'][1]), c.w)}` };
    if (o.kind === 'text') { const br = (s) => s.replace(/\n/g, ' ↵ '); return { 무엇을: '글자', 전: br(o.text[0]), 후: br(o.text[1]), 비율: '' }; }
    return { 무엇을: '숨김(지우기)', 전: '보임', 후: '안 보임', 비율: '' };
  }
  function renderList() {
    $('nOps').textContent = ops.length;
    const ol = $('ops'); ol.textContent = '';
    for (const o of ops) {
      const h = human(o), li = document.createElement('li');
      li.innerHTML = `<div class="where"></div><div class="what"></div><button type="button" title="이 줄 지우기">✕</button>`;
      li.querySelector('.where').textContent = `${CLASSES[o.cls].label} · ${SCREENS.find((s) => s[0] === o.screen)[1]} · ${o.desc}`;
      li.querySelector('.what').textContent = `${h.무엇을}: ${h.전} → ${h.후}${h.비율 ? ` (${h.비율})` : ''}`;
      li.querySelector('button').onclick = () => {
        if (o.cls === cls && o.screen === screen) { const el = doc().querySelector(o.selector); if (el) { setProps(el, o.props, 0); if (o.html) el.innerHTML = o.html[0]; } }
        ops = ops.filter((x) => x !== o); save();
      };
      ol.append(li);
    }
  }
  $('tList').onclick = () => { $('list').hidden = !$('list').hidden; };
  $('tClear').onclick = () => { if (ops.length && confirm(`바꾼 것 ${ops.length}개를 모두 지울까요? (화면은 다시 엽니다)`)) { ops = []; save(); load(); } };
  $('tExport').onclick = () => {
    if (editingText) finishText();
    const build = [...(doc()?.scripts || [])].map((s) => s.src).find((s) => /assets\/main-/.test(s))?.split('/').pop() || '';
    const data = {
      앱: 'Poster Studio', 빌드: build, 내보낸때: new Date().toISOString(),
      기준: Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, `${c.label} ${c.w}×${c.h}`])),
      바꾼것: ops.map((o) => ({ 갈래: CLASSES[o.cls].label, 갈래키: o.cls, 기준: o.size, 화면: SCREENS.find((s) => s[0] === o.screen)[1], 화면키: o.screen,
        요소: { 설명: o.desc, 주소: o.selector, 크기: o.rect }, ...human(o), css: Object.fromEntries(Object.entries(o.props).map(([p, v]) => [p, v[1]])), ...(o.html ? { html: { 전: o.html[0], 후: o.html[1] } } : {}), 때: o.at })),
    };
    const a = document.createElement('a');
    const n = new Date(), p2 = (v) => String(v).padStart(2, '0'), stamp = `${n.getFullYear()}${p2(n.getMonth() + 1)}${p2(n.getDate())}-${p2(n.getHours())}${p2(n.getMinutes())}`;   // 이 컴퓨터 시각(한국 시간)
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = `ps-editor-변경-${stamp}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    status(`내보냈습니다: ${a.download} (바꾼 것 ${ops.length}개) — 이 파일을 세션에 전해 주세요.`);
  };

  window.addEventListener('resize', () => (fitting ? fit() : applyZoom()));
  renderList();
  applyZoom();
  fit();
  load();
})();

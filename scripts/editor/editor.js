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
  let cls = 'pc', screen = 'first', zoom = 0.5, mode = 'edit', sels = [], busy = false, editingText = null, textBefore = null;
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
      status(`${c.label} ${c.w}×${c.h} · ${SCREENS.find((s) => s[0] === screen)[1]} — 누르면 고르기(Shift · Ctrl+누르기 더하기) · 고르지 않은 곳에서 끌면 상자로 여러 개 · 고른 것을 끌면 함께 옮기기 · 모서리 크기 · Del 숨기기 · Ctrl+Z 되돌리기 · 방향키 1px(Shift 10px) · Esc 풀기.${missing ? ` ⚠ 앞서 바꾼 것 ${missing}개는 이 화면에서 요소를 못 찾았습니다.` : ''}${note}`);
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

  // ───── 앱 위 덧그림(고른 테두리 · 모서리 손잡이 · 끌어 그리는 고르기 상자) ─────
  // 여러 개 고르기(2026-10-23 Bumm님 «마우스로 블록 지정해서 여러 개 한꺼번에 선택해서 끄는 게 안 되잖아. 이러면 옮기다가 다 깨져 버려»):
  //  · 고르지 않은 곳에서 끌면 고르기 상자 — 상자 안에 다 든 요소 가운데 가장 바깥 것들을 고른다(Shift · Ctrl이면 더한다).
  //    고르지 않은 요소는 끌어도 옮겨지지 않는다 — 고르려다 큰 상자를 통째로 옮겨 배치가 깨지던 것을 막는다.
  //  · 누르면 하나 고르기, Shift · Ctrl+누르기는 더하기 · 빼기. 고른 것을 끌면 모두 같이 옮긴다(translate라 흐름은 그대로 — 다른 요소가 밀리지 않는다).
  //  · 여럿을 고른 묶음의 모서리는 묶음 전체를 같은 비율로 줄이고 키운다(scale + translate — 이것도 흐름은 그대로).
  //  · 묶음으로 한 일은 기록에 같은 묶음 번호(batch)를 달아 되돌리기 한 번에 함께 되돌린다. 바꾼 목록 · 내보내기에는 요소마다 남는다.
  let ov, hv, box, tag, marq;
  const outlines = [];
  function installOverlay() {
    const d = doc();
    if (d.getElementById(OWN + '-ov')) return;
    const st = d.createElement('style');
    // 손잡이 · 이름표는 보기 배율을 거꾸로 곱해(--ps-k = 1/배율) 화면에서 늘 같은 크기로 보이게 한다 — 38%로 볼 때 12px 손잡이는 4px라 못 잡는다
    st.textContent = `#${OWN}-ov{position:fixed;inset:0;pointer-events:none;z-index:2147483647}
      .${OWN}-hv{position:fixed;outline:calc(2px*var(--ps-k,1)) dashed #0ea5e9;pointer-events:none}
      .${OWN}-box{position:fixed;outline:calc(2px*var(--ps-k,1)) solid #6366f1;pointer-events:none}
      .${OWN}-one{position:fixed;outline:calc(1.5px*var(--ps-k,1)) solid #818cf8;pointer-events:none}
      .${OWN}-marq{position:fixed;border:calc(1.5px*var(--ps-k,1)) dashed #4f46e5;background:rgba(99,102,241,.10);pointer-events:none}
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
    marq = d.createElement('div'); marq.className = OWN + '-marq'; marq.hidden = true;
    outlines.length = 0;
    ov.append(hv, box, tag, marq);
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
  const union = (rs) => { const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top)), rr = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom)); return { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t }; };
  const between = (x0, y0, x1, y1) => { const l = Math.min(x0, x1), t = Math.min(y0, y1), r = Math.max(x0, x1), b = Math.max(y0, y1); return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t }; };
  function follow() {
    if (!ov || !ov.isConnected) return;
    const list = sels.filter((e) => e.isConnected);
    if (list.length) {
      const rs = list.map((e) => e.getBoundingClientRect()), r = union(rs), half = 7 / zoom;
      box.hidden = false; place(box, r);
      for (const k of box.children) {
        const h = k.dataset.h;
        k.style.left = (h.includes('w') ? -half : h.includes('e') ? r.width - half : r.width / 2 - half) + 'px';
        k.style.top = (h.includes('n') ? -half : h.includes('s') ? r.height - half : r.height / 2 - half) + 'px';
      }
      // 여럿이면 하나하나의 테두리도 옅게
      while (outlines.length < (list.length > 1 ? list.length : 0)) { const o = doc().createElement('div'); o.className = OWN + '-one'; ov.append(o); outlines.push(o); }
      outlines.forEach((o, i) => { const on = list.length > 1 && i < list.length; o.hidden = !on; if (on) place(o, rs[i]); });
      tag.hidden = false;
      tag.textContent = `${list.length === 1 ? describe(list[0]) : `${list.length}개 고름`} · ${Math.round(r.width)}×${Math.round(r.height)}`;
      tag.style.left = Math.max(0, r.left) + 'px'; tag.style.top = Math.max(0, r.top - 24 / zoom) + 'px';
    } else { box.hidden = true; tag.hidden = true; for (const o of outlines) o.hidden = true; }
    win().requestAnimationFrame(follow);
  }
  function hover(el) { if (!hv) return; if (!el || sels.includes(el) || mode !== 'edit') { hv.hidden = true; return; } hv.hidden = false; place(hv, el.getBoundingClientRect()); }
  // 고른 것 목록: 겹치는 것(다른 고른 것 안에 든 것)은 빼고 바깥 것만 — 안팎을 같이 옮기면 안쪽이 두 번 움직인다
  const norm = (list) => list.filter((e, i) => e && e.isConnected && list.indexOf(e) === i && !list.some((o) => o !== e && o && o.contains(e)));
  function setSel(list) {
    if (editingText) finishText();
    sels = norm(list);
    $('selName').textContent = !sels.length ? '고른 요소 없음' : sels.length === 1 ? describe(sels[0]) : `${sels.length}개 고름 — 끌어 함께 옮기기 · Del 숨기기 · 글자 −/+ · 모서리 비율 크기`;
  }
  function select(el) { setSel(el ? [el] : []); }
  const one = () => (sels.length === 1 ? sels[0] : null);
  // 고르기 상자 안에 다 든 요소 가운데 가장 바깥 것들
  function within(r) {
    const hits = [...doc().body.querySelectorAll('*')].filter((el) => {
      if (own(el) || /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|BR)$/.test(el.tagName)) return false;
      if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const b = el.getBoundingClientRect();
      return b.width >= 4 && b.height >= 4 && b.left >= r.left - 1 && b.top >= r.top - 1 && b.right <= r.right + 1 && b.bottom <= r.bottom + 1;
    });
    return hits.filter((el) => !hits.some((o) => o !== el && o.contains(el)));
  }
  // 묶음 번호 — 여럿을 한 번에 바꿀 때만 단다(하나면 예전 기록과 똑같다)
  const batchId = (n) => (n > 1 ? Date.now().toString(36) + Math.random().toString(36).slice(2, 6) : null);

  // ───── 끌기(옮기기 · 고르기 상자) · 손잡이(크기) ─────
  let drag = null;
  const cs = (el) => win().getComputedStyle(el);
  const px = (v) => parseFloat(v) || 0;
  const translateOf = (el) => { const t = cs(el).translate; if (!t || t === 'none') return [0, 0]; const [x, y] = t.split(' '); return [px(x), px(y || '0')]; };
  const scaleOf = (el) => { const s = cs(el).scale; return !s || s === 'none' ? 1 : px(s.split(' ')[0]) || 1; };
  function startResize(h, e) {
    const el = one();
    if (el) {   // 하나: 폭 · 높이(예전 그대로)
      const r = el.getBoundingClientRect(), s = cs(el);
      const extraW = s.boxSizing === 'border-box' ? 0 : px(s.paddingLeft) + px(s.paddingRight) + px(s.borderLeftWidth) + px(s.borderRightWidth);
      const extraH = s.boxSizing === 'border-box' ? 0 : px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
      drag = { kind: 'size', el, h, x: e.clientX, y: e.clientY, w: r.width, hgt: r.height, r, extraW, extraH, tr: translateOf(el), before: { width: el.style.width, height: el.style.height, translate: el.style.translate }, keep: /^(IMG|VIDEO|CANVAS)$/.test(el.tagName) !== e.shiftKey };
      return;
    }
    // 여럿: 묶음 전체를 같은 비율로 — 잡은 손잡이의 반대쪽을 제자리에 두고, 요소마다 scale을 곱하고 가운데를 그 비율로 옮긴다
    const items = sels.map((it) => ({ el: it, r: it.getBoundingClientRect(), tr: translateOf(it), sc: scaleOf(it), before: { scale: it.style.scale, translate: it.style.translate } }));
    drag = { kind: 'scale', h, x: e.clientX, y: e.clientY, g: union(items.map((i) => i.r)), items, moved: false };
  }
  function onDown(e) {
    if (mode !== 'edit') return;
    const t = e.target;
    if (editingText && editingText.contains(t)) return;
    if (t.classList?.contains(OWN + '-h') && sels.length) { e.preventDefault(); e.stopPropagation(); startResize(t.dataset.h, e); return; }
    if (own(t)) return;
    e.preventDefault(); e.stopPropagation();
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    const bare = t === doc().body || t === doc().documentElement;
    const hit = bare ? null : sels.find((s) => s === t || s.contains(t));
    if (hit && !add) {   // 고른 것을 잡으면: 고른 것 모두 함께 옮기기
      drag = { kind: 'move', x: e.clientX, y: e.clientY, click: hit, moved: false, items: sels.map((el) => ({ el, tr: translateOf(el), before: el.style.translate })) };
      return;
    }
    drag = { kind: 'marq', x: e.clientX, y: e.clientY, t: bare ? null : t, add, moved: false };   // 그 밖: 끌면 고르기 상자, 그냥 누르면 고르기
  }
  function onMove(e) {
    if (mode !== 'edit') return;
    if (!drag) { if (!own(e.target) && !(editingText && editingText.contains(e.target))) hover(e.target); return; }
    e.preventDefault();
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.kind === 'move') {
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
      drag.moved = true;
      for (const it of drag.items) it.el.style.translate = `${Math.round(it.tr[0] + dx)}px ${Math.round(it.tr[1] + dy)}px`;
    } else if (drag.kind === 'marq') {
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true; hover(null); marq.hidden = false; place(marq, between(drag.x, drag.y, e.clientX, e.clientY));
    } else if (drag.kind === 'scale') {
      const h = drag.h, g = drag.g;
      const w = g.width + (h.includes('e') ? dx : h.includes('w') ? -dx : 0), hh = g.height + (h.includes('s') ? dy : h.includes('n') ? -dy : 0);
      const k = Math.max(0.1, h.length === 2 ? Math.max(w / g.width, hh / g.height) : h === 'e' || h === 'w' ? w / g.width : hh / g.height);
      const ax = h.includes('w') ? g.right : h.includes('e') ? g.left : g.left + g.width / 2;
      const ay = h.includes('n') ? g.bottom : h.includes('s') ? g.top : g.top + g.height / 2;
      drag.moved = true;
      for (const it of drag.items) {
        const cx = it.r.left + it.r.width / 2, cy = it.r.top + it.r.height / 2;
        it.el.style.scale = String(+(it.sc * k).toFixed(4));
        it.el.style.translate = `${Math.round(it.tr[0] + (ax + (cx - ax) * k) - cx)}px ${Math.round(it.tr[1] + (ay + (cy - ay) * k) - cy)}px`;
      }
    } else {
      const h = drag.h, el = drag.el;
      let w = drag.w + (h.includes('e') ? dx : h.includes('w') ? -dx : 0);
      let hh = drag.hgt + (h.includes('s') ? dy : h.includes('n') ? -dy : 0);
      if (drag.keep && (h.length === 2)) { const k = Math.max(w / drag.w, hh / drag.hgt); w = drag.w * k; hh = drag.hgt * k; }
      w = Math.max(8, w); hh = Math.max(8, hh);
      if (h.includes('e') || h.includes('w') || drag.keep) el.style.width = Math.round(w - drag.extraW) + 'px';
      if (h.includes('n') || h.includes('s') || drag.keep) el.style.height = Math.round(hh - drag.extraH) + 'px';
      // 잡은 손잡이의 반대쪽 변을 제자리에 둔다 — 아래 · 가운데 정렬된 상자는 키우면 위 · 양옆으로 자라 모서리가 마우스를 안 따라온다
      el.style.translate = `${drag.tr[0]}px ${drag.tr[1]}px`;
      const now = el.getBoundingClientRect(), a = drag.r;
      const sx = h.includes('w') ? a.right - now.right : a.left - now.left;
      const sy = h.includes('n') ? a.bottom - now.bottom : a.top - now.top;
      el.style.translate = `${Math.round(drag.tr[0] + sx)}px ${Math.round(drag.tr[1] + sy)}px`;
    }
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.kind === 'move') {
      if (d.moved) { const b = batchId(d.items.length); for (const it of d.items) recordOn(it.el, 'move', { translate: [it.before, it.el.style.translate] }, { batch: b }); }
      else if (sels.length > 1) select(d.click);   // 여럿 고른 채로 누르기만 하면 그것 하나만
    } else if (d.kind === 'marq') {
      marq.hidden = true;
      if (!d.moved) {   // 그냥 누름: 고르기(Shift · Ctrl이면 더하기 · 빼기)
        if (!d.t) { if (!d.add) select(null); return; }
        setSel(d.add ? (sels.includes(d.t) ? sels.filter((s) => s !== d.t) : [...sels, d.t]) : [d.t]);
        return;
      }
      const inside = within(between(d.x, d.y, e.clientX, e.clientY));
      setSel(d.add ? [...sels, ...inside] : inside);
      if (!inside.length) status('상자 안에 다 들어온 요소가 없습니다 — 고를 것을 상자 안에 통째로 넣어 끌어 보세요.');
    } else if (d.kind === 'scale') {
      if (!d.moved) return;
      const b = batchId(d.items.length);
      for (const it of d.items) recordOn(it.el, 'scale', { scale: [it.before.scale, it.el.style.scale], translate: [it.before.translate, it.el.style.translate] }, { batch: b });
    } else {
      const props = {}, el = d.el;
      for (const p of ['width', 'height', 'translate']) if (d.before[p] !== el.style[p]) props[p] = [d.before[p], el.style[p]];
      if (Object.keys(props).length) recordOn(el, 'size', props, { w: d.w, h: d.hgt });
    }
  }
  function onKey(e) {
    if (mode !== 'edit') return;
    if (editingText) { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); finishText(); } return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (!sels.length) return;
    if (e.key === 'Escape') { e.preventDefault(); select(null); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); hide(); return; }
    const step = e.shiftKey ? 10 : 1, dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (dir) {
      e.preventDefault();
      const b = batchId(sels.length);
      for (const el of sels) { const before = el.style.translate, [x, y] = translateOf(el); el.style.translate = `${x + dir[0]}px ${y + dir[1]}px`; recordOn(el, 'move', { translate: [before, el.style.translate] }, { batch: b }); }
    }
  }
  document.addEventListener('keydown', (e) => { if (doc() && document.activeElement !== app) onKey.call(null, e); });

  // ───── 도구 단추 ─────
  $('tParent').onclick = () => { const el = one(); if (!el) { status('«↑ 감싼 상자»는 하나만 고른 채로 씁니다.', true); return; } if (el.parentElement && el.parentElement !== doc().body) select(el.parentElement); };
  const font = (k) => {
    if (!sels.length) return;
    const b = batchId(sels.length);
    for (const el of sels) { const before = el.style.fontSize, now = px(cs(el).fontSize); el.style.fontSize = Math.max(6, now + k) + 'px'; recordOn(el, 'font', { 'font-size': [before, el.style.fontSize] }, { from: now, batch: b }); }
  };
  $('tFontDown').onclick = () => font(-1);
  $('tFontUp').onclick = () => font(1);
  function hide() {
    if (!sels.length) return;
    // 크기는 숨기기 전에 다 재 둔다 — 하나를 숨기면 흐름이 바뀌어 다른 것의 크기가 달라진다
    const list = sels.map((el) => ({ el, r: el.getBoundingClientRect(), before: el.style.display })), b = batchId(list.length);
    select(null);
    for (const it of list) { it.el.style.display = 'none'; recordOn(it.el, 'hide', { display: [it.before, 'none'] }, { rect: it.r, batch: b }); }
  }
  $('tHide').onclick = hide;
  $('tText').onclick = () => {
    if (editingText) { finishText(); return; }
    const el = one();
    if (!el || !el.textContent.trim()) { status(sels.length > 1 ? '글자 고치기는 하나만 고른 채로 합니다.' : '글자가 든 요소를 먼저 고르세요.', true); return; }
    // 안의 구조(굵은 글씨 · 줄바꿈 · 단추 이름표)를 지키려고 글자가 아니라 HTML 통째로 전/후를 남긴다
    editingText = el; textBefore = { text: el.innerText, html: el.innerHTML }; el.contentEditable = 'true'; el.focus();
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
  function recordOn(el, kind, props, extra = {}) {
    const c = CLASSES[cls], r = extra.rect || el.getBoundingClientRect();
    ops.push({ id: Date.now() + Math.random(), ...here(), size: `${c.w}x${c.h}`, selector: selectorOf(el), desc: describe(el), kind, props, text: extra.text || null, html: extra.html || null, rect: { w: Math.round(r.width), h: Math.round(r.height) }, from: extra.from ?? null, start: extra.w ? { w: Math.round(extra.w), h: Math.round(extra.h) } : null, at: new Date().toISOString(), ...(extra.batch ? { batch: extra.batch } : {}) });
    save();
  }
  function setProps(el, props, which) { for (const [p, v] of Object.entries(props)) el.style.setProperty(p, v[which] || ''); }
  function undo() {
    const i = ops.map((o) => o.cls === cls && o.screen === screen).lastIndexOf(true);
    if (i < 0) { status('이 화면에서 되돌릴 것이 없습니다.'); return; }
    const o = ops[i], group = o.batch ? ops.filter((x) => x.batch === o.batch) : [o];
    for (const g of [...group].reverse()) { const el = doc().querySelector(g.selector); if (el) { setProps(el, g.props, 0); if (g.html) el.innerHTML = g.html[0]; } }
    ops = ops.filter((x) => !group.includes(x)); save();
    if (group.length > 1) status(`묶음 ${group.length}개를 한 번에 되돌렸습니다.`);
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
    if (o.kind === 'scale') { const b = px(o.props.scale[0]) || 1, a = px(o.props.scale[1]) || 1; return { 무엇을: '크기(묶음 비율)', 전: `${Math.round(b * 100)}%`, 후: `${Math.round(a * 100)}%`, 비율: `${Math.round((a / b) * 100)}%로` }; }
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
      li.querySelector('.what').textContent = `${o.batch ? '묶음 · ' : ''}${h.무엇을}: ${h.전} → ${h.후}${h.비율 ? ` (${h.비율})` : ''}`;
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
        요소: { 설명: o.desc, 주소: o.selector, 크기: o.rect }, ...human(o), css: Object.fromEntries(Object.entries(o.props).map(([p, v]) => [p, v[1]])), ...(o.html ? { html: { 전: o.html[0], 후: o.html[1] } } : {}), ...(o.batch ? { 묶음: o.batch } : {}), 때: o.at })),
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

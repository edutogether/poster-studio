#!/usr/bin/env node
/* 해상도 구간 조사(2026-10-23 Bumm님 «2560에서만 개발하다 보니 해상도가 낮아지면 겹치고 잘린다», 팀장 전달) — 고치기 전에 재는 도구.

     node scripts/verify/viewport-survey.mjs <주소> <결과 폴더> [--sizes pc:1366x768,tablet:1024x768,...]

   크기마다 같은 흐름(1단계 → 2단계 찍기 전 → 카메라 켠 뒤 → 찍은 뒤 → 로딩 → 3단계 → 저장 · 출력)을 지나며 화면마다 잰다:
   ① 가로 스크롤(문서 폭 > 화면 폭) ② 화면 밖(오른쪽 · 왼쪽으로 삐져나간 요소 — 잘라 내는 부모가 없을 때. 있으면 그 칸의 가장자리를 넘어 감춰진 단추 · 글을 «칸 밖»으로 센다)
   ③ 잘린 글자(overflow로 감춘 칸보다 글이 김 · 말줄임) ④ 겹침(글 · 그림 · 단추끼리 4px 넘게 포개짐 — 글은 글자가 실제로 차지한 자리로 잰다.
      떠 있는 것이 끼면 글 · 단추끼리만 센다(그림 위 배지 · 화살표는 일부러 얹은 것), 배경 칠한 고정 줄이 덮는 것은 맨 위 · 맨 아래 두 스크롤 자리에서
      모두 덮일 때만, 잠깐 뜨는 알림(role=status)은 빼고, 모달 창이 떠 있으면 그 창 안만)
   ⑤ 아래로 잘림(감춘 칸 밖으로 글자가 밀려나 안 보임 — 로고처럼 그림을 일부러 잘라 보이는 칸은 세지 않는다).
   ⑥ 빈 띠(카메라 영상 · 찍은 사진을 칸에 다 담았는데 칸 비율이 사진과 달라 위아래 · 양옆에 띠가 남음, 2px 넘게).
   --sizes는 «갈래:가로x세로»(갈래 = pc · tablet · phone, 안 적으면 폭으로 짐작). 같은 크기도 갈래가 다르면 따로 잰다.
   --selftest는 결함 · 미끼를 심은 시험 페이지 여섯 장으로 판정 18가지를 확인한다(하나라도 틀리면 종료코드 1).
   --view를 주면 결함이 없어도 화면마다 창 크기 그대로 한 장씩 남긴다(사람이 눈으로 볼 것). 표의 «↓N»은 참고 — 주 단추까지 N px 내려야 보인다.
   결함이 있는 화면은 «갈래-크기-화면.png»(원본 해상도, 페이지 전체)로 남기고, 모두를 report.json · report.md 표로 낸다.
   카메라는 가짜(라이브의 공개 예시 인물), 생성(/generate)은 페이지 안에서 답한다 — 네트워크로 나가면 종료코드 2. 휴대폰 크기는 아이폰, 태블릿은 아이패드로 흉내 낸다. */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [url, outArg] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sizes');
const SELFTEST = args.includes('--selftest');
if (!SELFTEST && (!url || !outArg)) { console.error('사용법: node scripts/verify/viewport-survey.mjs <주소> <결과 폴더> [--sizes 갈래:WxH,...] [--view] | --selftest'); process.exit(2); }
// 갈래:크기. 1024×768은 PC(터치 없음)와 태블릿(아이패드) 두 번 잰다 — 같은 크기라도 기기 흉내가 다르다
// PC 뒤쪽 여섯은 «실제 창»: 화면 크기에서 크롬 탭 · 주소창(약 85px)과 윈도 작업 표시줄(48px)을 뺀 높이. 화면 배율 150% · 125%인 1920×1080 노트북은 1280 · 1536 폭이 된다
const DEFAULT = 'pc:1024x768,pc:1280x800,pc:1366x768,pc:1440x900,pc:1536x864,pc:1600x900,pc:1920x1080,pc:2560x1440,'
  + 'pc:1280x587,pc:1366x635,pc:1536x731,pc:1440x767,pc:1920x947,pc:2560x1307,'
  + 'tablet:768x1024,tablet:1024x768,tablet:820x1180,tablet:1180x820,tablet:1024x1366,tablet:1366x1024,phone:360x640,phone:390x664,phone:430x740';
const VIEW = args.includes('--view');   // 결함이 없어도 화면마다 보이는 그대로(창 크기) 한 장씩 남긴다 — 사람이 눈으로 볼 것
// 화면마다 보이는 요소 전부의 자리 · 크기 · 글자를 «snap-갈래-크기-화면.json»으로 남긴다 — 비율 기준 전환 전 · 뒤를 layout-compare.mjs로 대조(10/23).
// 화소가 아니라 배치를 대조하는 까닭: 카메라 · 대기 영상 · 애니메이션은 찍을 때마다 화소가 다르다.
const SNAPSHOT = args.includes('--snapshot');
const LAYOUT = `(() => {
  const out = [], vis = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
  const key = (el) => { const p = []; for (let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement) {
    const sib = e.parentElement ? [...e.parentElement.children].filter((x) => x.tagName === e.tagName) : [e];
    p.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (sib.length > 1 ? ':' + sib.indexOf(e) : '')); } return p.join('>'); };
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|SOURCE|TRACK)$/.test(el.tagName) || !vis(el)) continue;
    const r = el.getBoundingClientRect(); if (r.width < 0.5 && r.height < 0.5) continue;
    const s = getComputedStyle(el);
    out.push([key(el), Math.round(r.left * 2) / 2, Math.round(r.top * 2) / 2, Math.round(r.width * 2) / 2, Math.round(r.height * 2) / 2, s.fontSize, s.lineHeight, s.color, s.backgroundColor]);
  }
  return { w: innerWidth, h: innerHeight, sx: scrollX, sy: scrollY, docH: document.documentElement.scrollHeight, els: out };
})()`;
const guess = (w) => (w <= 760 ? 'phone' : 'pc');   // 갈래를 안 적으면 폭으로 짐작한다
const sizes = opt('--sizes', DEFAULT).split(',').map((s) => { const [k, wh] = s.includes(':') ? s.split(':') : [null, s]; const [w, h] = wh.split('x').map(Number); return { w, h, kind: k || guess(w) }; });
const UA = {
  phone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  tablet: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

const MEASURE = `(() => {
  const W = innerWidth, H = innerHeight;
  const vis = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.getClientRects().length > 0;
  const name = (el) => { const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 22); return (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '')) + (t ? ' «' + t + '»' : ''); };
  const clipsX = (el) => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (/(hidden|clip|auto|scroll)/.test(s.overflowX)) { const r = a.getBoundingClientRect(); if (r.left >= -1 && r.right <= W + 1) return true; } } return false; };
  // 모달 창(로딩 등)이 떠 있으면 뒤 페이지는 가려져 눌리지도 않는다 — 창 안만 잰다. 떠 있음은 창 안에서 따진다(창 자체는 fixed다)
  const modal = document.querySelector('dialog:modal'), scope = modal || document.body;
  const floating = (el) => { for (let x = el; x && x !== scope && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'absolute' || p === 'fixed' || p === 'sticky') return true; } return false; };
  const inModalOrHidden = (el) => !!el.closest('dialog:not([open]), [hidden], [aria-hidden="true"]');
  const hscroll = Math.max(0, document.documentElement.scrollWidth - W);
  const off = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    if ((r.right > W + 1 || r.left < -1) && !clipsX(el) && getComputedStyle(el).position !== 'fixed') off.push(name(el) + ' ' + Math.round(r.left) + '~' + Math.round(r.right));
  }
  // 칸 밖: 화면 안이라도 가로를 잘라 내는 가장 가까운 조상(overflow ≠ visible)의 가장자리를 넘어 감춰진 단추 · 글. 위 «화면 밖»은 잘라 내는 부모가 있으면
  //   건너뛰어서, 10/23 태블릿 세로 2단계 «이 사진으로 포스터 만들기»가 오른쪽 칸 밖으로 50px 나가 잘린 것을 «깨끗»으로 냈다.
  //   일부러 옆으로 넘기는 칸(가로 scroll-snap · 세로는 감추고 가로만 스크롤)과 그림(일부러 자른 로고)은 세지 않는다.
  const cutBox = (el) => { for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) { const s = getComputedStyle(a); if (!/(hidden|clip|auto|scroll)/.test(s.overflowX)) continue;
    return /x|both|inline/.test(s.scrollSnapType) || (/(auto|scroll)/.test(s.overflowX) && /(hidden|clip)/.test(s.overflowY)) ? null : a; } return null; };
  for (const el of scope.querySelectorAll('button, a, input, select, textarea, label, h1, h2, h3, p, li, span, strong')) {
    if (!vis(el) || inModalOrHidden(el)) continue; const r = el.getBoundingClientRect(); if (r.width <= 2 || r.height <= 2) continue;
    if (/^(SPAN|STRONG|A|LABEL)$/.test(el.tagName) && el.parentElement?.closest('button, a, p, h1, h2, h3, li, label')) continue;
    if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !el.textContent.trim()) continue;
    const box = cutBox(el); if (!box) continue; const b = box.getBoundingClientRect();
    if (r.right > b.right + 1 || r.left < b.left - 1) off.push('(칸 밖) ' + name(el) + ' ' + Math.round(r.left) + '~' + Math.round(r.right) + ' / 칸 ' + Math.round(b.left) + '~' + Math.round(b.right));
  }
  const clipped = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el) || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const s = getComputedStyle(el); const hides = /(hidden|clip)/.test(s.overflowX + s.overflowY) || s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none';
    if (hides && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) clipped.push(name(el) + ' ' + el.scrollWidth + '/' + el.clientWidth + '×' + el.scrollHeight + '/' + el.clientHeight);
  }
  // 겹침: «잎» 덩어리(글이 직접 든 요소 · 그림 · 영상 · 캔버스 · 단추 · 입력칸)끼리.
  //   흐름 안의 것끼리는 무엇이든 센다. 떠 있는 것(absolute · fixed · sticky)이 끼면 글 · 단추끼리만 센다 — 그림 위에 얹은 표시(배지 · 체크)는 일부러 겹친 것이다.
  //   fixed · sticky가 낀 겹침은 맨 위와 맨 아래 두 스크롤 자리에서 모두 겹칠 때만 센다(내려서 비켜 볼 수 있으면 결함이 아니다).
  const MEDIA = /^(IMG|VIDEO|CANVAS)$/;
  // 보이는 글 없이 그림만 든 단추(포스터 넘기기 칸)는 그림으로 친다
  const mediaLike = (el) => MEDIA.test(el.tagName) || (!el.textContent.trim() && !!el.querySelector('img, video, canvas'));
  // 글 덩어리는 글자가 실제로 차지한 자리로 잰다 — 블록 제목은 상자가 줄 끝까지 늘어나 글자 없는 빈자리에서 겹침이 잡혔다
  const TEXTUAL = /^(H1|H2|H3|P|LI|LABEL|SPAN|STRONG|A)$/;
  const rectOf = (o) => { if (o.box || !TEXTUAL.test(o.el.tagName)) return o.el.getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(o.el);
    const rs = [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0); if (!rs.length) return o.el.getBoundingClientRect();
    return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) }; };
  const pinned = (el) => { for (let x = el; x && x !== scope && x !== document.body; x = x.parentElement) { const p = getComputedStyle(x).position; if (p === 'fixed' || p === 'sticky') return true; } return false; };
  const leaves = [...scope.querySelectorAll('img, video, canvas, button, input, textarea, select, h1, h2, h3, p, li, label, span, strong, a')].filter((el) => {
    if (!vis(el) || inModalOrHidden(el) || el.closest('#printArea')) return false;
    // 문장 안의 조각은 문장으로 센다. 홀로 선 이름표 · 배지(문장 밖 span)는 그 자체로 센다 — 예전 판정은 closest가 null인 것까지 빼서 이것들을 아예 안 봤다
    const host = el.parentElement?.closest('button, a, p, h1, h2, h3, li, label');
    if (/^(SPAN|STRONG|A|LABEL)$/.test(el.tagName) && host) return false;
    if (/^(SPAN|STRONG)$/.test(el.tagName) && !el.textContent.trim()) return false;   // 글 없는 장식 조각
    const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4;
  }).map((el) => ({ el, fl: floating(el), pin: pinned(el), media: mediaLike(el) }));
  const hit = (a, b) => { const p = rectOf(a), q = rectOf(b); const ow = Math.min(p.right, q.right) - Math.max(p.left, q.left), oh = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); return ow > 4 && oh > 4 ? { ow, oh, x: Math.max(p.left, q.left), y: Math.max(p.top, q.top) + scrollY } : null; };
  const pairs = [];
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i], b = leaves[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if ((a.fl || b.fl) && (a.media || b.media)) continue;
    const h = hit(a, b); if (h) pairs.push({ a, b, h });
  }
  // 덮개: 배경이 칠해진 fixed · sticky 상자(단추 줄 · 머리줄)가 흐름 안의 잎을 덮는 것. 화면 거의 전체를 덮는 막(로딩 · 창 뒷막)은 일부러 덮는 것이라 뺀다
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el)) continue; const s = getComputedStyle(el);
    if (s.position !== 'fixed' && s.position !== 'sticky') continue;
    if (s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.backgroundImage === 'none') continue;
    if (el.closest('[role="status"], [role="alert"], [aria-live]')) continue;   // 잠깐 떴다 사라지는 알림(저장 안내 등)은 일부러 위에 띄운 것이다
    const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.width * r.height > W * H * 0.9) continue;
    const c = { el, pin: true, box: true };
    for (const l of leaves) { if (l.pin || el.contains(l.el) || l.el.contains(el)) continue; const h = hit(c, l); if (h) pairs.push({ a: c, b: l, h }); }
  }
  const sy = scrollY, maxY = document.scrollingElement.scrollHeight - H;
  if (maxY > 4 && pairs.some((p) => p.a.pin || p.b.pin)) { scrollTo(0, maxY); for (const p of pairs) if ((p.a.pin || p.b.pin) && !hit(p.a, p.b)) p.gone = true; scrollTo(0, sy); }
  const overlaps = pairs.filter((p) => !p.gone).map(({ a, b, h }) => name(a.el) + ' ↔ ' + name(b.el) + ' ' + Math.round(h.ow) + '×' + Math.round(h.oh) + ' @' + Math.round(h.x) + ',' + Math.round(h.y));
  // 참고(결함 아님): 이 단계의 주 단추가 첫 화면 아래에 있어 내려야 보이는 거리
  const below = ['prepareNextBtn', 'startBtn', 'shotBtn', 'phoneShotBtn', 'generateBtn', 'printBtn', 'saveBtn'].map((id) => document.getElementById(id))
    .filter((el) => el && vis(el) && !inModalOrHidden(el)).map((el) => ({ id: el.id, px: Math.round(el.getBoundingClientRect().bottom - H) })).filter((x) => x.px > 0);
  // 아래로 잘림: 세로 overflow를 감춘 칸 밖으로 «글자»가 밀려나 감춰진 곳. 그림을 일부러 잘라 보이는 칸(로고 · 필름 틀)은 결함이 아니다
  const cutY = [];
  for (const el of scope.querySelectorAll('*')) {
    if (!vis(el) || inModalOrHidden(el)) continue; const s = getComputedStyle(el);
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;   // 화면 읽기 프로그램에만 들리는 1px 숨김 제목
    if (!/(hidden|clip)/.test(s.overflowY) || el.scrollHeight <= el.clientHeight + 4 || /carousel|gallery|dialog-carousel/.test(el.className)) continue;
    const box = el.getBoundingClientRect(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent.trim() || !vis(t.parentElement)) continue;
      const rg = document.createRange(); rg.selectNodeContents(t);
      const cut = [...rg.getClientRects()].some((r) => r.height > 0 && (r.bottom > box.bottom + 2 || r.top < box.top - 2));
      if (cut) { cutY.push(name(el) + ' «' + t.textContent.trim().slice(0, 16) + '» ' + el.scrollHeight + '/' + el.clientHeight); break; }
    }
  }
  // 빈 띠: 카메라 영상 · 찍은 사진(#video · #snapshot)을 «안에 다 담기»(contain)로 그렸는데 그 칸 비율이 사진과 달라 위아래 · 양옆에 빈 띠가 남는 것.
  //   10/23 태블릿 세로 · PC 1024×768에서 찍은 뒤 큰 검은 띠가 남았다(위 판정들은 빈 자리는 보지 않는다). 2px 넘으면 센다. 꽉 채우기(cover)는 띠가 없다.
  const bands = [];
  for (const el of document.querySelectorAll('#video, #snapshot')) {
    if (!vis(el) || el.classList.contains('hidden')) continue;
    const iw = el.videoWidth || el.naturalWidth, ih = el.videoHeight || el.naturalHeight; if (!iw || !ih) continue;
    const fit = getComputedStyle(el).objectFit; if (fit !== 'contain' && fit !== 'scale-down') continue;
    const r = el.getBoundingClientRect(), ar = iw / ih, bx = r.width - Math.min(r.width, r.height * ar), by = r.height - Math.min(r.height, r.width / ar);
    if (bx > 2 || by > 2) bands.push(name(el) + ' ' + (bx > 2 ? '양옆 ' + Math.round(bx) : '위아래 ' + Math.round(by)) + 'px · 칸 ' + Math.round(r.width) + '×' + Math.round(r.height) + ' · 사진 ' + iw + '×' + ih);
  }
  return { hscroll, off: [...new Set(off)].slice(0, 12), clipped: clipped.slice(0, 12), overlaps: overlaps.slice(0, 12), cutY: cutY.slice(0, 8), bands, below, docH: document.documentElement.scrollHeight, H };
})()`;
const delay = (ms) => new Promise((r) => globalThis.setTimeout(r, ms));

// 자기검사(--selftest): 결함을 심은 페이지 두 장에 MEASURE를 돌려, 심은 것은 모두 잡고 일부러 그런 것(미끼)은 하나도 안 잡는지 본다
if (SELFTEST) {
  const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='10' height='10' fill='red'/%3E%3C/svg%3E";
  const A = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif">
    <div id=textcut style="height:60px;overflow:hidden;width:200px">첫 줄<br>둘째 줄<br>셋째 줄 감춰짐</div>
    <span id=logo style="display:block;position:relative;width:88px;height:44px;overflow:hidden"><img style="position:absolute;width:108px;height:108px;top:-32px" src="${svg}"></span>
    <h2 id=sr style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap">숨김 제목 길게 길게</h2>
    <div style="position:relative;width:300px"><p id=para style="margin:0">흐름 안의 문단입니다</p><button id=floatbtn style="position:absolute;left:20px;top:4px">떠 있는 단추</button></div>
    <div style="position:relative;width:200px;height:120px"><img id=poster style="width:200px;height:120px" src="${svg}"><span id=badge style="position:absolute;right:4px;top:4px">완성</span></div>
    <div style="position:relative;width:600px"><h1 id=wideh1 style="margin:0;font-size:24px">짧은 제목</h1><a id=corner href="#" style="position:absolute;right:0;top:0">구석 링크</a></div>
    <div style="position:relative;width:300px;height:60px"><button id=slide aria-label="다음 포스터 보기" style="width:300px;height:60px;padding:0;border:0"><img style="width:300px;height:60px" src="${svg}"></button><button id=arrow style="position:absolute;right:4px;top:10px">다음</button></div>
    <p id=toast role=status style="position:fixed;left:20px;top:150px;margin:0;background:#000;color:#fff">알림</p>
    <div style="height:150px"></div><p id=under style="margin:0">고정 줄에 늘 가려지는 글</p>
    <div id=dock style="position:fixed;left:0;right:0;bottom:0;height:200px;background:#eee"><button>다음</button></div>
    <div id=wide style="width:1500px;height:10px"></div></body>`;
  const B = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif;padding-bottom:220px">
    <div style="height:550px"></div><p id=reachable style="margin:0">처음엔 고정 줄 밑, 내리면 보이는 글</p>
    <div style="position:fixed;left:0;right:0;bottom:0;height:200px;background:#eee"><button>다음</button></div></body>`;
  const C = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif"><p id=behind style="margin:40px">모달 뒤에 가려진 페이지 글</p>
    <dialog id=dlg style="margin:0;inset:0;width:600px;height:300px"><div style="position:relative"><p id=inmodal style="margin:0">창 안 문단입니다</p><span id=inmodalfloat style="position:absolute;left:10px;top:0">겹친 글</span></div></dialog>
    <script>document.getElementById('dlg').showModal()</script></body>`;
  const D = `<!doctype html><meta charset=utf-8><body style="margin:0;font:20px/30px sans-serif">
    <div style="width:200px;height:80px;overflow-y:auto"><button id=widebtn style="width:260px">칸보다 넓은 단추</button></div>
    <div style="width:200px;display:flex;overflow-x:auto;scroll-snap-type:x mandatory"><button id=snap1 style="flex:0 0 180px">한 장</button><button id=snap2 style="flex:0 0 180px">두 장</button></div>
    <div style="width:120px;overflow-x:auto;overflow-y:hidden;white-space:nowrap"><span id=chip>옆으로 넘겨 보는 긴 이름표</span></div></body>`;
  // 빈 띠: 정사각 사진을 가로로 긴 칸에 다 담기(contain) → 양옆 띠, 같은 사진을 꽉 채우기(cover) → 띠 없음
  const E = `<!doctype html><meta charset=utf-8><body style="margin:0"><img id=snapshot style="width:300px;height:100px;object-fit:contain;background:#000" src="${svg}"></body>`;
  const F = `<!doctype html><meta charset=utf-8><body style="margin:0"><img id=snapshot style="width:300px;height:100px;object-fit:cover" src="${svg}"></body>`;
  const port = 9579, dir = await fs.mkdtemp(path.join(os.tmpdir(), 'survey-self-'));
  const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let fails = 0;
  try {
    let target;
    for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
    const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => { ws.onopen = r; });
    let seq = 0; const pending = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
    const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
    await call('Emulation.setDeviceMetricsOverride', { width: 1000, height: 700, deviceScaleFactor: 1, mobile: false });
    const run = async (html) => { await call('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) }); await delay(700); return (await call('Runtime.evaluate', { expression: MEASURE, returnByValue: true })).result.result.value; };
    const a = await run(A), b = await run(B), c = await run(C), d = await run(D), e = await run(E), f = await run(F);
    const has = (list, id) => list.some((s) => s.includes('#' + id));
    const expect = [
      ['글자 잘림을 잡는다', has(a.cutY, 'textcut')], ['일부러 자른 로고는 안 잡는다', !has(a.cutY, 'logo')], ['1px 숨김 제목은 안 잡는다', !has(a.cutY, 'sr')],
      ['떠 있는 단추가 문단을 덮으면 잡는다', a.overlaps.some((s) => s.includes('#floatbtn') && s.includes('#para'))],
      ['그림 위 배지는 안 잡는다', !a.overlaps.some((s) => s.includes('#badge'))],
      ['고정 줄에 늘 가려지는 글을 잡는다', has(a.overlaps, 'under')],
      ['내리면 비켜 보이는 글은 안 잡는다', b.overlaps.length === 0],
      ['가로 스크롤을 잡는다', a.hscroll > 0 && has(a.off, 'wide')],
      ['줄 끝까지 늘어난 제목 상자 옆 구석 링크는 안 잡는다', !a.overlaps.some((s) => s.includes('#corner'))],
      ['그림만 든 넘기기 칸 위 화살표는 안 잡는다', !a.overlaps.some((s) => s.includes('#arrow'))],
      ['그림 위에 잠깐 띄운 알림은 안 잡는다', !a.overlaps.some((s) => s.includes('#toast'))],
      ['모달 뒤 페이지 글은 안 잡는다', !c.overlaps.some((s) => s.includes('#behind'))],
      ['모달 안 겹침은 잡는다', c.overlaps.some((s) => s.includes('#inmodalfloat') && s.includes('#inmodal'))],
      ['세로 스크롤 칸 밖으로 잘린 단추를 잡는다', has(d.off, 'widebtn')],
      ['옆으로 넘기는 칸(scroll-snap)의 다음 장은 안 잡는다', !has(d.off, 'snap2')],
      ['가로만 스크롤하는 이름표 줄은 안 잡는다', !d.off.some((s) => s.includes('옆으로 넘겨'))],
      ['사진을 다 담은 칸의 빈 띠를 잡는다', has(e.bands, 'snapshot')],
      ['꽉 채운 사진은 띠로 안 잡는다', f.bands.length === 0],
    ];
    for (const [what, ok] of expect) { console.log(`${ok ? '통과' : '실패'}: ${what}`); if (!ok) fails++; }
    ws.close();
  } finally { chrome.kill(); await delay(300); await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
  process.exit(fails ? 1 : 0);
}

const out = path.resolve(outArg);
await fs.mkdir(out, { recursive: true });
const base = url.replace(/\/?$/, '/');

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'survey-'));
const art = path.join(profile, 'art.webp');
await fs.writeFile(art, Buffer.from(await (await fetch(base + 'studio/camera-student.webp')).arrayBuffer()));
// 가짜 카메라는 가로(PC · 태블릿 가로)와 세로(휴대폰 · 태블릿 세로 — 세워 든 아이패드는 세로 영상을 준다) 두 벌 — 크롬 한 번에 한 파일이라 묶음마다 크롬을 새로 띄운다
const y4m = (w, h) => { const f = path.join(profile, `cam-${w}x${h}.y4m`); const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-loop', '1', '-i', art, '-t', '3', '-r', '15', '-pix_fmt', 'yuv420p', '-vf', `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`, f]); if (r.status !== 0) throw new Error('y4m: ' + r.stderr); return f; };

const report = [];
let generateSeen = 0;
let port = 9580;
const portrait = (s) => s.h > s.w;
const groups = [['pc', [1280, 720], () => true], ['tablet', [1280, 720], (s) => !portrait(s)], ['tablet', [960, 1280], portrait], ['phone', [960, 1280], () => true]];
try {
  for (const [g, [cw, ch], pick] of groups) {
    const list = sizes.filter((s) => s.kind === g && pick(s));
    if (!list.length) continue;
    const cam = y4m(cw, ch);
    port += 1;
    const chrome = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-first-run', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${cam}`,
      `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(profile, 'chrome-' + g + '-' + port)}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
    try {
      let target;
      for (let i = 0; i < 80 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* 아직 */ } if (!target) await delay(100); }
      if (!target) throw new Error('크롬에 붙지 못했다');
      const ws = new globalThis.WebSocket(target.webSocketDebuggerUrl);
      await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
      let seq = 0; const pending = new Map();
      ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.method === 'Network.requestWillBeSent' && /\/generate/.test(m.params.request.url)) generateSeen++; if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
      const call = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
      const evaluate = async (expression) => { const m = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (m.result?.exceptionDetails) throw new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 200)); return m.result?.result?.value; };
      const waitFor = async (expr, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await evaluate(expr).catch(() => false)) return true; await delay(100); } return false; };
      await call('Network.enable');
      await call('Network.setBlockedURLs', { urls: ['*cloudfunctions.net*/generate*'] });
      await call('Page.enable');
      if (g !== 'pc') { await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await call('Emulation.setUserAgentOverride', { userAgent: UA[g] }); }
      await call('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
        const net = window.fetch.bind(window);
        window.fetch = async (input, init) => { const u = String((input && input.url) || input); if (!/\\/generate/.test(u)) return net(input, init);
          await new Promise((r) => setTimeout(r, 3000)); const b = await (await net('/studio/camera-student.webp')).blob();
          const data = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
          return new Response(JSON.stringify({ images: [data] }), { status: 200, headers: { 'content-type': 'application/json' } }); };
        // 인쇄 창은 띄우지 않고, 창이 닫힌 것처럼 afterprint를 보낸다 — 앱이 인쇄용 큰 포스터를 그때 걷어 낸다(안 보내면 화면 아래에 남아 겹침으로 잘못 잡힌다)
        window.print = () => { setTimeout(() => window.dispatchEvent(new Event('afterprint')), 0); }; navigator.canShare = () => true; navigator.share = async () => {};
        ${ch > cw ? `const md = navigator.mediaDevices; const gum = md.getUserMedia.bind(md); md.getUserMedia = (c) => { const v = c && c.video; return gum(v && typeof v === 'object' && v.width && v.height ? { ...c, video: { ...v, width: v.height, height: v.width } } : c); };` : ''}
      })();` });
      for (const { w, h } of list) {
        const tag = `${w}x${h}`;
        await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: g !== 'pc' });
        const shot = async (screen) => {
          await delay(500);
          const m = await evaluate(MEASURE);
          const bad = m.hscroll || m.off.length || m.clipped.length || m.overlaps.length || m.cutY.length || m.bands.length;
          report.push({ size: tag, kind: g, screen, ...m, bad: !!bad });
          if (bad) {
            const metrics = await call('Page.getLayoutMetrics');
            const fullH = Math.min(Math.ceil(metrics.result.cssContentSize.height), 8000);
            const s = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: fullH, scale: 1 } });
            await fs.writeFile(path.join(out, `${g}-${tag}-${screen}.png`), Buffer.from(s.result.data, 'base64'));
            // 화면 밖까지 찍으면 잠깐 창 높이가 바뀐다 — 다음 화면을 같은 크기에서 재도록 되돌린다
            await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: g !== 'pc' });
          }
          if (VIEW) {
            const s = await call('Page.captureScreenshot', { format: 'png' });
            await fs.writeFile(path.join(out, `${g}-${tag}-${screen}-view.png`), Buffer.from(s.result.data, 'base64'));
          }
          if (SNAPSHOT) await fs.writeFile(path.join(out, `snap-${g}-${tag}-${screen}.json`), JSON.stringify(await evaluate(LAYOUT), null, 0));
          console.log(`${tag} ${screen}: ${bad ? `가로 ${m.hscroll} · 화면 밖 ${m.off.length} · 잘림 ${m.clipped.length} · 겹침 ${m.overlaps.length} · 아래 잘림 ${m.cutY.length} · 빈 띠 ${m.bands.length}` : '깨끗'}`);
        };
        try {
          await call('Page.navigate', { url: base });
          if (!await waitFor('!!document.getElementById("prepareNextBtn") && !document.getElementById("splash")', 20000)) throw new Error('첫 화면');
          await evaluate('document.fonts.ready.then(() => true)'); await delay(600);
          await shot('1-1단계');
          await evaluate('scrollTo(0, document.scrollingElement.scrollHeight); document.getElementById("prepareNextBtn").click(); true');
          if (!await waitFor('!document.getElementById("cameraView").hidden')) throw new Error('2단계');
          await delay(1200); await evaluate('scrollTo(0, 0); true');
          await shot('2-2단계-찍기전');
          const phoneBtn = await evaluate("(() => { const b = document.getElementById('phoneShotBtn'); return !!b && getComputedStyle(b).display !== 'none'; })()");
          if (!phoneBtn) { await evaluate("document.getElementById('startBtn').click(); true"); }
          else { await evaluate("document.getElementById('phoneShotBtn').click(); true"); }
          if (!await waitFor('(() => { const v = document.getElementById("video"); return !!v && !v.classList.contains("hidden") && v.videoWidth > 0; })()')) throw new Error('카메라');
          await delay(900);
          // «카메라 준비 완료» 알림(1.8초)이 사라진 뒤에 잰다 — 남아 있으면 그 알림 하나로 칸 안 요소 순서가 밀려 배치 대조가 매번 달라졌다(10/23)
          await waitFor('!document.querySelector(".camera-ready-notice")', 4000);
          await shot('3-2단계-켠뒤');
          if (!phoneBtn) await evaluate("document.getElementById('shotBtn').click(); true");
          if (!await waitFor('!document.getElementById("generateBtn").hidden', 20000)) throw new Error('촬영');
          await waitFor('!document.querySelector(".captured-badge, .camera-capture-notice")', 6000);
          await shot('4-2단계-찍은뒤');
          await evaluate("document.getElementById('generateBtn').click(); true");
          if (!await waitFor('!!document.getElementById("spinner")?.open')) throw new Error('로딩');
          await delay(1200);
          await shot('5-로딩');
          if (!await waitFor('!document.getElementById("resultView").hidden', 60000)) throw new Error('3단계');
          await delay(3500); await evaluate('scrollTo(0, 0); true');
          await shot('6-3단계');
          const save = await evaluate("(() => { const b = document.getElementById('saveBtn'); if (b && getComputedStyle(b).display !== 'none') { b.click(); return 'save'; } document.getElementById('printBtn').click(); return 'print'; })()");
          await delay(800);
          await shot(save === 'save' ? '7-저장' : '7-출력');
        } catch (e) {
          report.push({ size: tag, kind: g, screen: '흐름', error: e.message, bad: true });
          console.log(`${tag}: ${e.message}에서 막힘`);
        }
      }
      ws.close();
    } finally { chrome.kill(); await delay(400); }
  }
} finally {
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
}
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
// 표: 크기 × 화면, 칸에는 결함 종류 수
const screens = [...new Set(report.filter((r) => r.screen !== '흐름').map((r) => r.screen))];
const lines = ['| 크기 | 갈래 | ' + screens.join(' | ') + ' |', '|---|---|' + screens.map(() => '---|').join('')];
for (const { w, h, kind } of sizes) {
  const tag = `${w}x${h}`; const rs = report.filter((r) => r.size === tag && r.kind === kind);
  // 칸: 🟢/🔴 결함 종류 수, 뒤의 «↓N»은 참고 — 주 단추까지 N px 내려야 보인다
  const cell = (s) => { const r = rs.find((x) => x.screen === s); if (!r) return rs.find((x) => x.error) ? '막힘' : '—';
    const down = r.below?.length ? ` ↓${Math.max(...r.below.map((b) => b.px))}` : '';
    if (!r.bad) return '🟢' + down;
    const k = []; if (r.hscroll) k.push(`가로${r.hscroll}`); if (r.off.length) k.push(`밖${r.off.length}`); if (r.clipped.length) k.push(`잘림${r.clipped.length}`); if (r.overlaps.length) k.push(`겹침${r.overlaps.length}`); if (r.cutY.length) k.push(`아래${r.cutY.length}`); if (r.bands?.length) k.push(`띠${r.bands.length}`); return '🔴 ' + k.join(' ') + down; };
  lines.push(`| ${tag} | ${kind} | ${screens.map(cell).join(' | ')} |`);
}
await fs.writeFile(path.join(out, 'report.md'), lines.join('\n') + '\n');
console.log(lines.join('\n'));
if (generateSeen) { console.error(`❌ 생성 요청이 네트워크에 ${generateSeen}건 잡혔다`); process.exit(2); }

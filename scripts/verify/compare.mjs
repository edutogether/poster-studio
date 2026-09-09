#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   스냅샷 두 개를 대조해 차이를 보고한다.

     node scripts/verify/compare.mjs <before.json> <after.json> [--json]

   before = 전환 전(freeze 태그 워크트리), after = 전환 후.
   snapshot.js가 뽑은 파일을 그대로 넣는다.

   판정 기준
   - 요소 키가 한쪽에만 있으면 **유실/신규**로 본다(가장 무거운 차이).
   - computed style은 문자열 완전 일치.
   - rect는 0.5px까지 허용(서브픽셀 반올림). 그 이상은 차이.
   - 속성(attrs)·문서 수준 값(title/lang/ids/meta/link)은 완전 일치.

   ⚠ 이 스크립트가 "차이 0"을 내놓는 것 자체가 증명이 되려면, 스크립트가
   진짜 차이를 잡을 수 있어야 한다. selftest.mjs가 일부러 틀린 스냅샷을
   넣어 실제로 잡히는지 확인한다(§5.4).
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';

const RECT_TOLERANCE_PX = 0.5;

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* 실행마다 반드시 달라지는 값을 비교 전에 정규화한다. 스냅샷 파일에는 원본을
   그대로 남기고(나중에 따져볼 수 있게) 비교할 때만 느슨하게 본다.

   왜 필요한가 — 실측으로 확인한 두 가지:
   ① blob: URL은 매 실행 새로 발급된다(#snapshot의 src).
   ② 포스터 PNG의 바이트 수가 매번 다르다. layout.js의 grain()이 128×128 노이즈
      타일을 Math.random()으로 그리기 때문이다. 즉 **설계상 비결정적**이라
      전환과 무관하게 항상 다르다. 실측 차이는 0.03~1.2% 수준이었다.
      그래서 유효숫자 2자리로 뭉뚱그린다 — 그림이 비거나(수십 KB) 크기가
      확 달라지는 진짜 회귀는 여전히 잡히고, 노이즈는 통과한다. */
const normalizeAttr = (v) => {
  if (typeof v !== 'string') return v;
  if (v.startsWith('blob:')) return 'blob:<실행마다 다름>';
  const m = /^data:([^;]*);bytes=(\d+)$/.exec(v);
  if (m) {
    const n = Number(m[2]);
    const mag = Math.pow(10, Math.max(0, String(n).length - 2));
    return `data:${m[1]};bytes≈${Math.round(n / mag) * mag}`;
  }
  return v;
};

/** 두 스냅샷의 차이 목록을 만든다. 반환값은 { severity, kind, key, prop, before, after }[] */
export function diffSnapshots(before, after) {
  const out = [];
  const add = (severity, kind, key, prop, b, a) =>
    out.push({ severity, kind, key, prop, before: b, after: a });

  // ── 문서 수준 ──────────────────────────────────────────────
  for (const f of ['title', 'lang']) {
    if (before.document[f] !== after.document[f]) {
      add('high', 'document', f, f, before.document[f], after.document[f]);
    }
  }

  // 요소 id 집합 — 유실이 특히 위험하다(Voice Cinema 사례)
  const bIds = new Set(before.document.ids), aIds = new Set(after.document.ids);
  for (const id of bIds) if (!aIds.has(id)) add('high', 'id-missing', id, 'id', id, null);
  for (const id of aIds) if (!bIds.has(id)) add('low', 'id-added', id, 'id', null, id);

  // meta / link — 문자열로 정규화해 다중집합 비교
  const norm = (arr) => arr.map((o) => JSON.stringify(o)).sort();
  for (const field of ['metas', 'links']) {
    const b = norm(before.document[field]), a = norm(after.document[field]);
    for (const v of b) if (!a.includes(v)) add('high', `${field}-missing`, v, field, v, null);
    for (const v of a) if (!b.includes(v)) add('low', `${field}-added`, v, field, null, v);
  }

  // ── 요소 수준 ──────────────────────────────────────────────
  const bKeys = Object.keys(before.elements), aKeys = Object.keys(after.elements);
  for (const k of bKeys) {
    if (!(k in after.elements)) { add('high', 'element-missing', k, '-', '있음', '없음'); continue; }
    const b = before.elements[k], a = after.elements[k];

    if (b.tag !== a.tag) add('high', 'tag', k, 'tag', b.tag, a.tag);
    if (b.text !== a.text) add('high', 'text', k, 'text', b.text, a.text);

    const bc = b.classes.join(' '), ac = a.classes.join(' ');
    if (bc !== ac) add('medium', 'classes', k, 'class', bc, ac);

    // 속성 — §5.5의 핵심. 화면에 안 보이므로 픽셀 대조로는 절대 안 잡힌다.
    const attrKeys = new Set([...Object.keys(b.attrs), ...Object.keys(a.attrs)]);
    for (const at of attrKeys) {
      const bv = normalizeAttr(b.attrs[at]), av = normalizeAttr(a.attrs[at]);
      if (bv !== av) add('high', 'attr', k, at, b.attrs[at] ?? null, a.attrs[at] ?? null);
    }

    // computed style
    for (const p of Object.keys(b.style)) {
      if (b.style[p] !== a.style[p]) {
        // 움직임 관련은 대표님이 못박은 "체감" 항목이라 따로 표시한다.
        const motion = p.startsWith('transition') || p.startsWith('animation') || p === 'transform';
        add(motion ? 'high' : 'medium', motion ? 'motion' : 'style', k, p, b.style[p], a.style[p]);
      }
    }

    for (const d of ['w', 'h', 'x', 'y']) {
      if (Math.abs(b.rect[d] - a.rect[d]) > RECT_TOLERANCE_PX) {
        add('medium', 'rect', k, d, b.rect[d], a.rect[d]);
      }
    }
  }
  for (const k of aKeys) {
    if (!(k in before.elements)) add('medium', 'element-added', k, '-', '없음', '있음');
  }

  return out;
}

export function summarize(diffs) {
  const byKind = {};
  for (const d of diffs) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  return {
    total: diffs.length,
    high: diffs.filter((d) => d.severity === 'high').length,
    medium: diffs.filter((d) => d.severity === 'medium').length,
    low: diffs.filter((d) => d.severity === 'low').length,
    byKind
  };
}

/* CLI로 직접 실행됐을 때만 동작한다(테스트가 import할 땐 안 돈다). */
const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (invokedDirectly) {
  const [beforePath, afterPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!beforePath || !afterPath) {
    console.error('사용법: node scripts/verify/compare.mjs <before.json> <after.json> [--json]');
    process.exit(2);
  }
  const before = load(beforePath), after = load(afterPath);

  /* 🔴 빈 게이트 방지(COMMON_STANDARDS §21-1). 스냅샷이 요소를 하나도 안 담고 있으면
     대조는 "차이 0건"을 내놓는데, 그건 같다는 뜻이 아니라 **아무것도 안 봤다**는 뜻이다.
     페이지가 안 뜬 채로 뜬 스냅샷, 선택자가 깨진 스냅샷이 여기로 들어온다.
     이 도구의 "차이 0건"에 전환 검증 전체가 걸려 있으므로 여기서 막는다. */
  for (const [label, snap, p] of [['before', before, beforePath], ['after', after, afterPath]]) {
    const n = Object.keys(snap.elements || {}).length;
    if (n === 0) {
      console.error(`${label} 스냅샷(${p})에 요소가 0개입니다 — 대조가 무의미합니다. 페이지가 제대로 떴는지 확인하고 다시 뜨세요.`);
      process.exit(2);
    }
  }

  const diffs = diffSnapshots(before, after);
  const sum = summarize(diffs);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ summary: sum, diffs }, null, 2));
  } else {
    const bv = before.meta.viewport, av = after.meta.viewport;
    console.log(`대조: ${beforePath} (${bv.w}×${bv.h}) ↔ ${afterPath} (${av.w}×${av.h})`);
    console.log(`요소 ${Object.keys(before.elements).length} → ${Object.keys(after.elements).length}`);
    if (bv.w !== av.w || bv.h !== av.h) {
      console.log('⚠ 뷰포트가 다르다 — 같은 크기에서 뽑은 스냅샷끼리 비교해야 의미가 있다.');
    }
    console.log('');
    if (!diffs.length) {
      console.log('✅ 차이 0건.');
    } else {
      for (const sev of ['high', 'medium', 'low']) {
        const rows = diffs.filter((d) => d.severity === sev);
        if (!rows.length) continue;
        console.log(`\n── ${sev} (${rows.length}건) ──`);
        for (const d of rows.slice(0, 60)) {
          console.log(`  [${d.kind}] ${d.key} · ${d.prop}\n      전: ${d.before}\n      후: ${d.after}`);
        }
        if (rows.length > 60) console.log(`  … 외 ${rows.length - 60}건(--json으로 전부 확인)`);
      }
      console.log(`\n합계 ${sum.total}건 (high ${sum.high} / medium ${sum.medium} / low ${sum.low})`);
    }
  }
  process.exit(sum.high > 0 ? 1 : 0);
}

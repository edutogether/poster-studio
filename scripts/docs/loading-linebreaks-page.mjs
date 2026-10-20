/* 로딩 화면 설명 줄 «끊는 자리 고르기» 검토 페이지를 만든다(2026-10-20 저녁 Bumm님, 팀장 전달 — 배포와 따로).

     node scripts/docs/loading-linebreaks-page.mjs <조사 JSON(loading-linebreaks.mjs 결과)> <출력 폴더>

   장면 12개마다: 지금 360 · 390 · 430에서 실제로 끊기는 자리(조사 결과) · 낱말 사이를 눌러 끊는 자리 고르기 · 고른 대로 세 폭 미리보기 ·
   맨 아래 복사 상자(고른 결과 — 그대로 세션에 붙여 주면 반영). 글꼴은 이 저장소의 서브셋 Pretendard를 상대 경로로 쓴다
   (출력 폴더 안 fonts/로 복사한다). */
import fs from 'node:fs';
import path from 'node:path';

const [jsonArg, outArg] = process.argv.slice(2);
if (!jsonArg || !outArg) { console.error('사용: node scripts/docs/loading-linebreaks-page.mjs <조사 JSON> <출력 폴더>'); process.exit(1); }
const survey = JSON.parse(fs.readFileSync(jsonArg, 'utf8'));
const src = fs.readFileSync('src/studio/waitingSets.ts', 'utf8');
const sets = JSON.parse(src.slice(src.indexOf('['), src.lastIndexOf(']') + 1));
const out = path.resolve(outArg);
fs.mkdirSync(out, { recursive: true });
// 글꼴은 출력 폴더 안으로 복사해 페이지를 혼자 열 수 있게 한다(맥 · 다른 체크아웃에서도 같은 화면).
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
for (const f of ['Regular', 'Bold', 'ExtraBold']) fs.copyFileSync(path.resolve('public/fonts/subset', `Pretendard-${f}.woff2`), path.join(out, 'fonts', `Pretendard-${f}.woff2`));
const fontDir = 'fonts';
const data = sets.map((s) => {
  const byWidth = {};
  for (const w of [360, 390, 430]) {
    const row = survey.find((r) => r.width === w && r.title.join('') .replace(/\s/g, '') === s.title.replace(/\s/g, ''));
    if (!row) throw Error(`${w}px에서 «${s.title}»를 못 찾음`);
    byWidth[w] = { title: row.title, factTitle: row.factTitle, body: row.body };
  }
  return { id: s.id, title: s.title, factTitle: s.fact.title, body: s.fact.body, now: byWidth };
});
const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>로딩 설명 줄 끊기</title>
<style>
@font-face { font-family: Studio; font-weight: 400; src: url("${fontDir}/Pretendard-Regular.woff2") format("woff2"); }
@font-face { font-family: Studio; font-weight: 700; src: url("${fontDir}/Pretendard-Bold.woff2") format("woff2"); }
@font-face { font-family: Studio; font-weight: 800; src: url("${fontDir}/Pretendard-ExtraBold.woff2") format("woff2"); }
:root { --ink:#1c1c1c; --soft:#666; --line:#e4e4e7; --accent:#6366F1; --accent-ink:#4F46E5; --ok:#10B981; --warn:#F59E0B; --bg:#fafafa; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 120px; background: var(--bg); color: var(--ink); font: 15px/1.6 Studio, "Malgun Gothic", sans-serif; }
h1 { margin: 0 0 6px; font-size: 22px; } .lead { margin: 0 0 20px; color: var(--soft); }
.scene { max-width: 1280px; margin: 0 auto 18px; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.scene h2 { margin: 0 0 4px; font-size: 16px; } .meta { color: var(--soft); font-size: 13px; margin-bottom: 10px; }
.pick { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; margin: 8px 0 12px; padding: 10px; border-radius: 8px; background: #f4f4f5; }
.word { padding: 2px 3px; } .gap { width: 18px; height: 28px; border: 1px dashed #c7c7cc; border-radius: 6px; background: #fff; cursor: pointer; color: transparent; }
.gap[aria-pressed="true"] { border: 2px solid var(--accent); background: #EEF2FF; color: var(--accent-ink); font-weight: 800; }
.gap[aria-pressed="true"]::after { content: "↵"; display: block; text-align: center; color: var(--accent-ink); }
.row { display: flex; flex-wrap: wrap; gap: 14px; }
.col { flex: 1 1 260px; } .col h3 { margin: 0 0 6px; font-size: 13px; color: var(--soft); font-weight: 700; }
.phone { margin: 0 auto 6px; padding: 14px 0; border: 1px solid var(--line); border-radius: 10px; background: #fff; text-align: center; }
.phone .t { color: #ed3124; font-size: 20px; font-weight: 800; line-height: 1.4; letter-spacing: -.5px; }
.phone .b { margin-top: 6px; color: #666; font-size: 15px; line-height: 1.55; word-break: keep-all; overflow-wrap: anywhere; white-space: pre-line; text-wrap: pretty; }   /* 앱 휴대폰 body와 같은 줄 맞춤 */
.now { font-size: 13px; color: var(--soft); } .now b { color: var(--ink); }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.b1 { background: #ECFDF5; color: #047857; } .b2 { background: #FFFBEB; color: #B45309; }
.copy { position: fixed; left: 0; right: 0; bottom: 0; padding: 10px 16px; background: #111; color: #fff; }
.copy textarea { width: 100%; height: 64px; border-radius: 8px; border: 0; padding: 8px; font: 13px/1.5 ui-monospace, Consolas, monospace; }
.copy button { margin-top: 6px; min-height: 36px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
@media (prefers-color-scheme: dark) { :root { --bg:#111; --line:#333; --soft:#aaa; } body { color:#eee; } .scene,.phone{ background:#1b1b1b; } .pick{background:#222;} .gap{background:#1b1b1b;} .now b{color:#eee;} }
</style></head><body>
<h1>로딩 화면 — 회색 설명 줄 끊는 자리 고르기</h1>
<p class="lead">장면 12개(샘플은 5개가 무작위로, 실제 생성은 기다리는 만큼 더 나옵니다)의 회색 설명 줄이 휴대폰 폭 360 · 390 · 430에서 <b>지금 실제로 끊기는 자리</b>(2026-10-20 헤드리스 크롬 실측)와, 낱말 사이 칸을 눌러 <b>끊을 자리를 고른 결과</b>를 세 폭으로 미리 봅니다. 아무것도 누르지 않으면 «지금 그대로»입니다. 다 고르면 맨 아래 복사 상자를 그대로 보내 주세요.</p>
<main id="list"></main>
<div class="copy"><textarea id="out" readonly aria-label="고른 결과"></textarea><br><button type="button" id="copyBtn">복사</button></div>
<script>
const DATA = ${JSON.stringify(data)};
const WIDTH = { 360: 320, 390: 350, 430: 390 };   // 화면 폭 − 양옆 20px(로딩 화면 안쪽 여백). 미리보기 상자는 테두리 1px씩을 더한다(글 칸이 앱과 같은 폭)
const chosen = {};
const list = document.getElementById('list');
const render = (s) => { const words = s.body.split(' '); const br = chosen[s.id] || []; return words.map((w, i) => w + (i < words.length - 1 ? (br.includes(i) ? '\\n' : ' ') : '')).join(''); };
function update() {
  for (const s of DATA) for (const w of [360, 390, 430]) document.getElementById('p' + s.id + '-' + w).textContent = render(s);
  const picked = DATA.filter((s) => (chosen[s.id] || []).length).map((s) => s.id + '번: ' + render(s).replace(/\\n/g, ' / '));
  document.getElementById('out').value = picked.length ? '로딩 설명 줄 끊기(Bumm님 선택)\\n' + picked.join('\\n') + '\\n나머지는 지금 그대로' : '(아직 고른 것 없음 — 전부 지금 그대로)';
}
for (const s of DATA) {
  const sec = document.createElement('section'); sec.className = 'scene';
  const lines = [360, 390, 430].map((w) => s.now[w].body.length);
  sec.innerHTML = '<h2>' + s.id + '번 · ' + s.title + '</h2><div class="meta">빨간 문구 «' + s.factTitle + '» · 지금 회색 설명 줄 수 360/390/430 = ' + lines.join(' / ') + ' ' + (Math.max(...lines) > 1 ? '<span class="badge b2">두 줄 있음</span>' : '<span class="badge b1">모두 한 줄</span>') + '</div>';
  const pick = document.createElement('div'); pick.className = 'pick'; pick.setAttribute('aria-label', '끊을 자리 고르기');
  const words = s.body.split(' ');
  words.forEach((w, i) => {
    const span = document.createElement('span'); span.className = 'word'; span.textContent = w; pick.append(span);
    if (i < words.length - 1) { const b = document.createElement('button'); b.type = 'button'; b.className = 'gap'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', '«' + w + '» 뒤에서 끊기');
      b.onclick = () => { const arr = chosen[s.id] = chosen[s.id] || []; const k = arr.indexOf(i); if (k >= 0) arr.splice(k, 1); else arr.push(i); arr.sort((a, c) => a - c); b.setAttribute('aria-pressed', String(k < 0)); update(); };
      pick.append(b); }
  });
  sec.append(pick);
  const row = document.createElement('div'); row.className = 'row';
  for (const w of [360, 390, 430]) {
    const col = document.createElement('div'); col.className = 'col';
    col.innerHTML = '<h3>' + w + 'px 휴대폰</h3><div class="phone" style="width:' + (WIDTH[w] + 2) + 'px"><div class="t">' + s.factTitle + '</div><div class="b" id="p' + s.id + '-' + w + '"></div></div><div class="now">지금: <b>' + s.now[w].body.join('</b> / <b>') + '</b></div>';
    row.append(col);
  }
  sec.append(row); list.append(sec);
}
document.getElementById('copyBtn').onclick = async () => { const t = document.getElementById('out'); t.select(); try { await navigator.clipboard.writeText(t.value); } catch { document.execCommand('copy'); } };
update();
</script></body></html>`;
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'survey.json'), JSON.stringify(data, null, 1));
console.log(`장면 ${data.length}개 → ${path.join(out, 'index.html')} (글꼴 경로 ${fontDir})`);

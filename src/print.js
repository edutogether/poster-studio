/* ────────────────────────────────────────────────────────────────────
   PNG 저장 / 인쇄. app.js 분리 작업(2026-08-30)으로 이 파일로 이동, 이어서
   ES모듈 전환(2026-08-30) — 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */
import { $ } from './constants.js';
import { setStatus } from './dom.js';
import { state } from './state.js';

$('downloadBtn').onclick = () => {
  if(!state.posters.length){ setStatus('먼저 포스터를 만들어 주세요.'); return; }
  const a=document.createElement('a');
  a.download=`InKY_영화포스터_${state.posters[state.selected].label}_${Date.now()}.png`;
  a.href=state.posters[state.selected].canvas.toDataURL('image/png'); a.click();
};
$('printBtn').onclick = () => {
  if(!state.posters.length){ setStatus('먼저 포스터를 만들어 주세요.'); return; }
  let area=$('printArea'); if(area) area.remove();
  area=document.createElement('div'); area.id='printArea';
  const img=document.createElement('img'); img.src=state.posters[state.selected].canvas.toDataURL('image/png');
  area.appendChild(img); document.body.appendChild(area);
  img.onload=()=>{ window.print(); };
};
window.addEventListener('afterprint', ()=>{ const a=$('printArea'); if(a) a.remove(); });

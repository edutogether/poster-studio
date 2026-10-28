// 설치 · 제거 창 녹화(installer-screen-record.ps1의 screen-NN.mkv)에서 «빈 화면» · «머리 빈» 프레임을 센다(10/28 Bumm님 «깜빡임 0», 팀장 판정: 화면이 넘어갈 때 빈 프레임 0 ·
// 진행 화면 모든 장에서 머리 글 · 그림이 보임).
//   node scripts/verify/recording-blank-frames.mjs <녹화.mkv> [...] [--json <결과.json>]
// 빈 화면 = 창 가운데 띠(위 17%부터 높이 45% · 좌우 15px 안쪽 — 머리 아래 화면 글 · 단추 · 그림 자리)에 어두운 화소가 하나도 없는 프레임(가장 어두운 밝기 > 150).
// 머리 글 빈 = 머리 띠(위 7.5~15.5% · 왼쪽 2~70% — 제목 · 부제 자리)에 어두운 화소가 없는 프레임. 머리 그림 빈 = 오른쪽 위 그림 칸(위 7~19% · 오른쪽 86~98%)에 어두운 화소가 없는 프레임.
// 첫 화면 · 완료 화면처럼 머리 없이 왼쪽 그림이 창을 덮는 화면은 머리 띠에 그림의 어두운 화소가 들어가 «있음»으로 센다(그림 칸은 그 화면에서 비므로 머리 글이 없을 때만 그림을 본다).
// 하나라도 있으면 종료코드 1. 프레임을 하나도 못 읽으면 실패(빈 게이트 금지).
// ⚠ 띠 밖(창 테두리 · 아래 단추 줄)은 보지 않는다 — 숫자와 함께 프레임을 눈으로 본다(10/28 실험 C: 띠 밖 머리만 빠진 판을 0으로 셌다 → 머리 띠를 더함).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
if (!args.length) { console.error('녹화 파일을 주세요'); process.exit(2); }

// 띠 하나의 프레임별 가장 어두운 밝기(YMIN)
function ymin(file, crop) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `crop=${crop},signalstats,metadata=print:key=lavfi.signalstats.YMIN:file=-`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = [];
  let t = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) { t = Number(m[1]); continue; }
    const y = line.match(/YMIN=(\d+)/);
    if (y && t !== null) out.push({ t, ymin: Number(y[1]) });
  }
  return out;
}

const results = [];
let bad = 0;
for (const file of args) {
  const mid = ymin(file, 'iw-30:ih*0.45:15:ih*0.17');
  const head = ymin(file, 'iw*0.68:ih*0.08:iw*0.02:ih*0.075');
  const art = ymin(file, 'iw*0.12:ih*0.12:iw*0.86:ih*0.07');
  const n = Math.min(mid.length, head.length, art.length);
  const blanks = mid.slice(0, n).filter((f) => f.ymin > 150).map((f) => f.t);
  const headless = [];
  for (let i = 0; i < n; i++) if (head[i].ymin > 150 || (art[i].ymin > 150 && head[i].ymin > 60)) headless.push(head[i].t);
  if (!n) bad++;
  bad += blanks.length + headless.length;
  results.push({ file, frames: n, blank: blanks.length, blankAt: blanks, headless: headless.length, headlessAt: headless });
  const at = (a) => (a.length > 8 ? a.slice(0, 8).map((x) => x.toFixed(3)).join(' ') + ' …' : a.map((x) => x.toFixed(3)).join(' '));
  console.log(`${n && !blanks.length && !headless.length ? '통과' : '걸림'}  ${file} — 프레임 ${n}장 · 빈 화면 ${blanks.length}장${blanks.length ? ' (' + at(blanks) + '초)' : ''} · 머리 빈 ${headless.length}장${headless.length ? ' (' + at(headless) + '초)' : ''}${n ? '' : ' · 프레임을 읽지 못함'}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
process.exit(bad ? 1 : 0);

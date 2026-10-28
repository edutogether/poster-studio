// 설치 · 제거 창 녹화(installer-screen-record.ps1의 screen-NN.mkv)에서 «빈 화면» 프레임을 센다(10/28 Bumm님 «깜빡임 0», 팀장 판정: 화면이 넘어갈 때 빈 프레임 0).
//   node scripts/verify/recording-blank-frames.mjs <녹화.mkv> [...] [--json <결과.json>]
// 빈 화면 = 창 가운데 띠(위 17%부터 높이 45% · 좌우 15px 안쪽 — 머리 아래 화면 글 · 단추 · 그림 자리)에 어두운 화소가 하나도 없는 프레임(가장 어두운 밝기 > 150).
// 글자 · 단추 테두리 · 그림이 하나라도 보이면 어두운 화소가 있다. 화면을 바꾸는 동안 지운 자리만 바탕색으로 칠해진 순간이 여기에 걸린다(10/28 8821d77: 위치 화면 1장 · 완료 화면 2장).
// 하나라도 있으면 종료코드 1. 프레임을 하나도 못 읽으면 실패(빈 게이트 금지).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const args = process.argv.slice(2);
const ji = args.indexOf('--json');
const jsonOut = ji >= 0 ? args.splice(ji, 2)[1] : null;
if (!args.length) { console.error('녹화 파일을 주세요'); process.exit(2); }

const results = [];
let bad = 0;
for (const file of args) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'crop=iw-30:ih*0.45:15:ih*0.17,signalstats,metadata=print:key=lavfi.signalstats.YMIN:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const frames = [];
  let t = null;
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = line.match(/pts_time:([\d.]+)/);
    if (m) { t = Number(m[1]); continue; }
    const y = line.match(/YMIN=(\d+)/);
    if (y && t !== null) frames.push({ t, ymin: Number(y[1]) });
  }
  const blanks = frames.filter((f) => f.ymin > 150);
  if (!frames.length) bad++;
  bad += blanks.length;
  results.push({ file, frames: frames.length, blank: blanks.length, at: blanks.map((f) => f.t) });
  console.log(`${frames.length ? (blanks.length ? '걸림' : '통과') : '걸림'}  ${file} — 프레임 ${frames.length}장 · 빈 화면 ${blanks.length}장${blanks.length ? ' · ' + blanks.map((f) => f.t.toFixed(3) + '초').join(' ') : ''}${frames.length ? '' : ' · 프레임을 읽지 못함'}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
process.exit(bad ? 1 : 0);

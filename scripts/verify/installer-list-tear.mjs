/* 설치 · 제거 창 녹화에서 «상자 줄이 반쯤 밀린 장면»을 센다(2026-10-28 Bumm님 «깜빡임 0», 팀장 전달).
   목록 상자는 줄을 올릴 때 화면 조각을 먼저 밀어 올리고 새 줄은 나중에 그린다 — 그 틈이 녹화 한 장면(33ms)에 잡히면 맨 아래 줄에 앞 줄 반쪽이 겹쳐 · 남아 보인다.
     node scripts/verify/installer-list-tear.mjs <screen.mkv>
   녹화는 installer-screen-record.ps1(설치 창 자리만, 초당 30장, 584×362 — 이 PC 100% 화면). 진행 화면(막대 왼쪽 끝이 녹색인 장면)만 본다.
   상자 줄 글자는 y=135~146(16px 간격, 100% 실측)에 놓인다. 밀린 장면은 ① 줄 사이 빈 띠(y=148~150 + 16k)에 글자가 걸치거나
   ② 한 줄 띠 안에서 글자 화소 사이에 빈 가로줄이 3줄 이상 끼어 있다. 결과는 JSON 한 줄(장면 수 · 시각 · 이유). 진행 화면 장면이 0개면 종료코드 1.
   installer-flicker-scan.mjs(«되돌아간 칸»)는 줄이 흐를 때 비슷한 줄이 다시 지나가는 것도 세므로, 상자 칸은 이 도구로 잰다. */
import { spawn } from 'node:child_process';

const [video] = process.argv.slice(2);
if (!video) { console.error('사용: installer-list-tear.mjs <screen.mkv>'); process.exit(2); }
const W = 584, H = 362, size = W * H * 3;
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
let buf = Buffer.alloc(0), n = 0, progress = 0;
const torn = [];
// 한 줄 띠 안에서 글자 화소 사이에 낀 가장 긴 빈 가로줄 수
const innerGap = (d) => {
  const first = d.findIndex((v) => v > 20), last = d.length - 1 - [...d].reverse().findIndex((v) => v > 20);
  if (first < 0 || last <= first) return 0;
  let run = 0, best = 0;
  for (let i = first; i <= last; i++) { run = d[i] < 3 ? run + 1 : 0; best = Math.max(best, run); }
  return best;
};
ff.stdout.on('data', (c) => {
  buf = Buffer.concat([buf, c]);
  while (buf.length >= size) {
    const px = buf.subarray(0, size); buf = buf.subarray(size);
    const at = (x, y) => (y * W + x) * 3;
    const g = at(35, 115);
    if (px[g + 1] > px[g] + 40 && px[g + 1] > px[g + 2] + 40) {
      progress++;
      const line = (y) => { let d = 0; for (let x = 36; x < 520; x++) { const i = at(x, y); if (px[i] + px[i + 1] + px[i + 2] < 330) d++; } return d; };
      const why = [];
      for (let k = 0; k < 10; k++) {
        const top = 135 + 16 * k;
        if (top + 15 >= 296) break;
        const gap = line(top + 13) + line(top + 14) + line(top + 15);
        if (gap > 20) why.push(`줄${k + 1} 사이 ${gap}`);
        const inner = innerGap(Array.from({ length: 12 }, (_, i) => line(top + i)));
        if (inner >= 3) why.push(`줄${k + 1} 안 빈 줄 ${inner}`);
      }
      // 맨 아래 반쪽 줄(10번째 줄부터 상자 아래 테두리 296까지)
      const bottom = innerGap(Array.from({ length: 296 - 279 }, (_, i) => line(279 + i)));
      if (bottom >= 3) why.push(`맨 아래 빈 줄 ${bottom}`);
      if (why.length) torn.push([+(n / 30).toFixed(2), n, why.join(' · ')]);
    }
    n++;
  }
});
ff.on('close', (code) => {
  console.log(JSON.stringify({ video: video.split(/[\\/]/).slice(-4).join('/'), frames: n, progressFrames: progress, torn: torn.length, at: torn.slice(0, 12) }));
  if (code !== 0 || progress === 0) { console.error(`진행 화면 장면을 찾지 못함(ffmpeg ${code}, 프레임 ${n})`); process.exit(1); }
});

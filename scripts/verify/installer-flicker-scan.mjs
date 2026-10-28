/* 설치 · 제거 창 «깜빡임» 판정(2026-10-28 Bumm님 «녹색 막대 화면에서 창 전체가 계속 깜빡인다», 팀장 전달).
   화면 녹화(ffmpeg gdigrab, 초당 30장)를 16화소 칸으로 나눠, 칸이 바뀌었다가 3장(0.1초) 안에 바로 앞 모습으로 되돌아가는 순간을 «깜빡임»으로 센다.
   진행 막대가 차오르거나 글 줄이 하나 더해지는 것은 되돌아가지 않으므로 세지 않는다.
   ⚠ 상자 줄이 흘러 올라갈 때 비슷한 줄이 2~3장 뒤 같은 자리에 오면 그것도 «되돌아감»으로 센다(10/28 장면을 뽑아 확인) — 상자 칸은 installer-list-tear.mjs로 잰다.
   막대 칸의 사건은 Windows 막대의 빛 흐름 애니메이션이다.
     node scripts/verify/installer-flicker-scan.mjs <screen.mkv> <폭> <높이> <결과.json> [x0 y0 x1 y1]
   [x0 y0 x1 y1]를 주면 그 네모(녹화 화소 기준 — 설치 창 자리) 안만 본다. 결과에는 깜빡임마다 시각 · 칸 수 · 범위가 남는다. */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const [video, W, H, out, ...box] = process.argv.slice(2);
const w = Number(W), h = Number(H);
if (!video || !w || !h || !out) {
  console.error('사용: installer-flicker-scan.mjs <screen.mkv> <폭> <높이> <결과.json> [x0 y0 x1 y1]');
  process.exit(2);
}
const [x0, y0, x1, y1] = box.length === 4 ? box.map(Number) : [0, 0, w, h];
const B = 16, FPS = 30, BACK = 3, CHANGE = 10, SAME = 4;
const cols = Math.floor((x1 - x0) / B), rows = Math.floor((y1 - y0) / B);
const size = w * h;
const history = [];   // 최근 프레임의 칸 평균(밝기)
const events = [];
let n = 0;
const means = (px) => {
  const m = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    let s = 0;
    for (let y = y0 + r * B; y < y0 + r * B + B; y += 2) for (let x = x0 + c * B; x < x0 + c * B + B; x += 2) s += px[y * w + x];
    m[r * cols + c] = s / ((B / 2) * (B / 2));
  }
  return m;
};
const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
let buf = Buffer.alloc(0);
ff.stdout.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= size) {
    const m = means(buf.subarray(0, size));
    buf = buf.subarray(size);
    history.push(m);
    if (history.length > BACK + 2) history.shift();
    // 지금 프레임이 BACK장 안쪽의 «바뀌기 직전» 모습으로 돌아왔는지: base(바뀌기 전) → 가운데 프레임들(바뀜) → 지금(base와 같음)
    if (history.length === BACK + 2) {
      const base = history[0], now = history[history.length - 1];
      const cells = [];
      for (let i = 0; i < m.length; i++) {
        if (Math.abs(now[i] - base[i]) > SAME) continue;
        let peak = 0;
        for (let k = 1; k < history.length - 1; k++) peak = Math.max(peak, Math.abs(history[k][i] - base[i]));
        if (peak > CHANGE) cells.push(i);
      }
      if (cells.length) {
        const xs = cells.map((i) => x0 + (i % cols) * B), ys = cells.map((i) => y0 + Math.floor(i / cols) * B);
        events.push({ frame: n - BACK, t: +((n - BACK) / FPS).toFixed(2), cells: cells.length, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs) + B, Math.max(...ys) + B] });
        history.splice(0, history.length - 1);   // 같은 깜빡임을 여러 번 세지 않는다
      }
    }
    n++;
  }
});
ff.on('close', (code) => {
  if (code !== 0 || n === 0) { console.error(`녹화를 읽지 못함(ffmpeg ${code}, 프레임 ${n})`); process.exit(1); }
  const big = events.filter((e) => e.cells >= 20);
  fs.writeFileSync(out, JSON.stringify({ video, frames: n, seconds: +(n / FPS).toFixed(1), area: [x0, y0, x1, y1], cell: B, flashes: events.length, bigFlashes: big.length, events }, null, 1));
  console.log(`프레임 ${n}개(${(n / FPS).toFixed(1)}초) · 깜빡임 ${events.length}번 · 큰 깜빡임(칸 20개 이상) ${big.length}번`);
  for (const e of big.slice(0, 40)) console.log(`  ${e.t}s 칸 ${e.cells} 범위 ${e.box.join(',')}`);
});

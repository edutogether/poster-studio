/* 설치 창 «빈 회색 화면» 판정(2026-10-27 — 설치 진행 캡처 일부가 빈 회색이라 사람 눈에도 깜빡이는지 가림, 팀장 전달).
   빈 화면 = 머리글 띠(흰 바탕)가 없고 목록 자리가 단색 회색(#F0F0F0)이다. 좌표는 한국어 Windows 100% 설치 창(585×362) 기준.
     node scripts/verify/installer-blank-scan.mjs calib <png...>               확인 도구가 찍은 그림에 판정을 대 본다(빈 것 · 정상인 것)
     node scripts/verify/installer-blank-scan.mjs video <screen.mkv> <폭> <높이>   화면 녹화(installer-screen-record.ps1) 전 프레임을 판정한다
   10/27 결과: 확인 도구가 0.3~0.5초마다 PrintWindow로 찍는 동안에는 화면에도 33ms 빈 화면이 10번 나왔고, 찍지 않은(-NoShots) 설치는
   진행 중 0번 · «범위 → 위치» 화면이 넘어가는 순간 한 장뿐이었다 — 빈 진행 캡처는 찍는 동작이 만든 것이다. */
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { loadImage, createCanvas } from '@napi-rs/canvas';

const HEADER = [10, 34, 500, 70];   // 창 기준 x0, y0, x1, y1 — 머리글 흰 띠(제목 줄 아래)
const BODY = [30, 140, 550, 290];   // 진행 목록 자리
function judge(px, w) {
  let white = 0, n1 = 0, gray = 0, n2 = 0;
  for (let y = HEADER[1]; y < HEADER[3]; y++) for (let x = HEADER[0]; x < HEADER[2]; x++) { const i = (y * w + x) * 3; n1++; if (px[i] >= 250 && px[i + 1] >= 250 && px[i + 2] >= 250) white++; }
  for (let y = BODY[1]; y < BODY[3]; y++) for (let x = BODY[0]; x < BODY[2]; x++) { const i = (y * w + x) * 3; n2++; if (Math.abs(px[i] - 240) <= 3 && Math.abs(px[i + 1] - 240) <= 3 && Math.abs(px[i + 2] - 240) <= 3) gray++; }
  const headerWhite = white / n1, bodyGray = gray / n2;
  return { headerWhite: +headerWhite.toFixed(3), bodyGray: +bodyGray.toFixed(3), blank: headerWhite < 0.3 && bodyGray > 0.9 };
}
const [mode, ...rest] = process.argv.slice(2);
if (mode === 'calib') {
  for (const f of rest) {
    const img = await loadImage(f); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data; const rgb = new Uint8Array(img.width * img.height * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    console.log(JSON.stringify({ file: f.split(/[\\/]/).pop(), ...judge(rgb, img.width) }));
  }
} else {
  const [video, w, h] = [rest[0], Number(rest[1]), Number(rest[2])];
  const size = w * h * 3;
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let buf = Buffer.alloc(0), n = 0; const rows = [];
  ff.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= size) { rows.push({ frame: n, t: +(n / 30).toFixed(2), ...judge(buf.subarray(0, size), w) }); n++; buf = buf.subarray(size); }
  });
  await new Promise((r) => ff.on('close', r));
  // 상태가 바뀌는 곳만 줄여 적는다(머리글 흰 띠 있음 / 없음 · 빈 화면)
  const seg = [];
  for (const r of rows) { const k = r.blank ? '빈 화면' : r.headerWhite >= 0.3 ? '머리글 있음' : '그 밖(다른 화면)'; if (!seg.length || seg.at(-1).state !== k) seg.push({ state: k, from: r.t, to: r.t, frames: 1 }); else { seg.at(-1).to = r.t; seg.at(-1).frames++; } }
  const out = { frames: rows.length, blankFrames: rows.filter((r) => r.blank).length, segments: seg };
  fs.writeFileSync(video.replace(/\.mkv$/, '-scan.json'), JSON.stringify({ ...out, rows }, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

/* 설치 창 «빈 회색 화면» 판정(2026-10-27 — 설치 진행 캡처 일부가 빈 회색이라 사람 눈에도 깜빡이는지 가림, 팀장 전달).
   빈 화면 = 머리글 띠(흰 바탕)가 없고 목록 자리가 단색 회색(#F0F0F0)이다. 좌표는 한국어 Windows 100% 설치 창(585×362) 기준.
     node scripts/verify/installer-blank-scan.mjs calib <png...>               확인 도구가 찍은 그림에 판정을 대 본다(빈 것 · 정상인 것)
     node scripts/verify/installer-blank-scan.mjs video <screen.mkv> <폭> <높이>   화면 녹화(installer-screen-record.ps1) 전 프레임을 판정한다
     node scripts/verify/installer-blank-scan.mjs changes <screen.mkv> <폭> <높이> <폴더>   진행 문구 줄(진행 막대 위 한 줄)이 바뀌는 순간의 장면을 원본 해상도 PNG로 뽑는다
   10/27 결과: 확인 도구가 0.3~0.5초마다 PrintWindow로 찍는 동안에는 화면에도 33ms 빈 화면이 10번 나왔고, 찍지 않은(-NoShots) 설치는
   진행 중 0번 · «범위 → 위치» 화면이 넘어가는 순간 한 장뿐이었다 — 빈 진행 캡처는 찍는 동작이 만든 것이다.
   🟠 본 것이 0이면 실패다(11/2 종합감사 — 예전에는 녹화를 못 열어 프레임 0장이어도 «빈 화면 0»으로 종료코드 0이었다):
   그림 0장(calib) · ffmpeg 실패 · 프레임 0장 · 모르는 방식 · 잘못된 폭 · 높이는 종료코드 1(사용법은 2). */
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
const USAGE = '사용: installer-blank-scan.mjs calib <png...> | video <screen.mkv> <폭> <높이> | changes <screen.mkv> <폭> <높이> <폴더>';
if (!['calib', 'video', 'changes'].includes(mode)) { console.error(USAGE); process.exit(2); }
if (mode !== 'calib') {
  const [video, w, h] = [rest[0], Number(rest[1]), Number(rest[2])];
  // 판정 칸(가로 최대 560 · 세로 최대 290)이 프레임 안에 들어가야 한다 — 밖이면 없는 화소를 읽어 조용히 «아님»으로 판정한다
  if (!video || !Number.isInteger(w) || !Number.isInteger(h) || w <= 560 || h <= BODY[3] || (mode === 'changes' && !rest[3])) { console.error(USAGE); process.exit(2); }
}
/** ffmpeg로 녹화를 rgb24 프레임으로 풀어 onFrame에 넘긴다. ffmpeg가 실패했거나 프레임이 0장이면 실패로 끝낸다. */
async function decode(video, size, onFrame) {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', video, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let buf = Buffer.alloc(0), n = 0;
  ff.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= size) { onFrame(buf.subarray(0, size), n); n++; buf = buf.subarray(size); }
  });
  const code = await new Promise((resolve) => { ff.on('error', (e) => { console.error(e.message); resolve(-1); }); ff.on('close', resolve); });
  if (code !== 0 || n === 0) {
    console.error(`실패: ffmpeg 종료코드 ${code} · 프레임 ${n}장 — 본 것이 없으면 판정할 수 없다(${video})`);
    process.exit(1);
  }
  return n;
}
if (mode === 'calib') {
  if (!rest.length) { console.error('실패: 대 볼 그림이 0장이다'); console.error(USAGE); process.exit(1); }
  for (const f of rest) {
    const img = await loadImage(f); const c = createCanvas(img.width, img.height); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data; const rgb = new Uint8Array(img.width * img.height * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    console.log(JSON.stringify({ file: f.split(/[\\/]/).pop(), ...judge(rgb, img.width) }));
  }
} else if (mode === 'changes') {
  // 진행 문구 줄(창 기준 y 92~110 · x 20~560)의 화소가 바뀌고 0.2초(6장) 그대로 머문 장면만 — 글이 그려지는 도중이 아니라 다 그려진 뒤를 고른다
  const [video, w, h, outDir] = [rest[0], Number(rest[1]), Number(rest[2]), rest[3]];
  fs.mkdirSync(outDir, { recursive: true });
  const size = w * h * 3, LINE = [20, 92, 560, 110];
  const key = (px) => { let k = ''; for (let y = LINE[1]; y < LINE[3]; y += 2) for (let x = LINE[0]; x < LINE[2]; x += 3) { const i = (y * w + x) * 3; k += px[i] > 128 ? '1' : '0'; } return k; };
  let last = null, run = 0, saved = null; const picks = [];
  const n = await decode(video, size, (px, frame) => {
    const k = key(px);
    run = k === last ? run + 1 : 0; last = k;
    if (run === 6 && k !== saved && /1/.test(k) && /0/.test(k)) {   // 6장 그대로 · 이미 뽑은 문구가 아님 · 글자가 있음(전부 같은 색이 아님)
      saved = k;
      const c = createCanvas(w, h), x = c.getContext('2d'), img = x.createImageData(w, h);
      for (let i = 0, j = 0; i < size; i += 3, j += 4) { img.data[j] = px[i]; img.data[j + 1] = px[i + 1]; img.data[j + 2] = px[i + 2]; img.data[j + 3] = 255; }
      x.putImageData(img, 0, 0);
      const file = `장면-${String(picks.length + 1).padStart(2, '0')}-${(frame / 30).toFixed(2)}초.png`;
      fs.writeFileSync(`${outDir}/${file}`, c.toBuffer('image/png'));
      picks.push(file);
    }
  });
  console.log(JSON.stringify({ frames: n, scenes: picks }));
} else {
  const [video, w, h] = [rest[0], Number(rest[1]), Number(rest[2])];
  const size = w * h * 3;
  const rows = [];
  await decode(video, size, (px, n) => rows.push({ frame: n, t: +(n / 30).toFixed(2), ...judge(px, w) }));
  // 상태가 바뀌는 곳만 줄여 적는다(머리글 흰 띠 있음 / 없음 · 빈 화면)
  const seg = [];
  for (const r of rows) { const k = r.blank ? '빈 화면' : r.headerWhite >= 0.3 ? '머리글 있음' : '그 밖(다른 화면)'; if (!seg.length || seg.at(-1).state !== k) seg.push({ state: k, from: r.t, to: r.t, frames: 1 }); else { seg.at(-1).to = r.t; seg.at(-1).frames++; } }
  const out = { frames: rows.length, blankFrames: rows.filter((r) => r.blank).length, segments: seg };
  fs.writeFileSync(video.replace(/\.mkv$/, '-scan.json'), JSON.stringify({ ...out, rows }, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

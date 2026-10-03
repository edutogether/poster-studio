/* 생성한 4×4 연속 프레임을 로컬 무음 루프로 묶는다. 네트워크/API 호출 없음.
   재현: node scripts/media/build-robot-loop.mjs (ffmpeg 필요) */
import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';

const source = '_docs/intents/2026-09-30-studio-design-integration/robot-artist-sprite-v2.png';
const output = 'public/studio/robot-artist-v2';
const frames = '.cache/robot-frames';
mkdirSync(frames, { recursive: true });
const sheet = await loadImage(source);
const cells = [];
for (let i = 0; i < 16; i++) {
  const canvas = createCanvas(384, 384);
  const context = canvas.getContext('2d');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, 384, 384);
  context.drawImage(sheet, (i % 4) * sheet.width / 4, Math.floor(i / 4) * sheet.height / 4, sheet.width / 4, sheet.height / 4, 0, 0, 384, 384);
  cells.push(canvas.toBuffer('image/png'));
}
// 뛰기 전과 착지 후에 머무는 시간을 둬 반복 동작이 과하게 바빠지지 않게 한다.
const order = [...Array(10).fill(0), ...Array.from({ length: 16 }, (_, i) => i), ...Array(10).fill(15), 0, 0, 0, 0];
order.forEach((cell, i) => writeFileSync(`${frames}/${String(i).padStart(3, '0')}.png`, cells[cell]));
const run = args => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error(`로봇 영상 변환 실패: ${result.status}`);
};
run(['-framerate', '10', '-i', `${frames}/%03d.png`, '-vf', 'minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1', '-an', '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${output}.mp4`]);
run(['-i', `${frames}/000.png`, '-frames:v', '1', '-c:v', 'libwebp', '-quality', '92', `${output}.webp`]);
console.log('로봇 루프와 정지 이미지 저장 완료: ' + output);

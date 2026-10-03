/* Blender로 렌더한 연속 프레임을 무음 MP4·정지 WebP로 변환한다.
   프레임 합성·보간 없이 30fps 원본 타이밍을 그대로 사용한다. */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const run = args => {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) throw new Error('로봇 영상 인코딩 실패: ' + result.status);
};
for (const scene of ['sketch', 'color', 'admire']) {
  const input = '.cache/robot-3d-v4/' + scene;
  for (let frame = 1; frame <= 180; frame++) {
    if (!existsSync(input + '/' + String(frame).padStart(4, '0') + '.png')) throw new Error('3D 렌더 프레임 누락: ' + scene + ' ' + frame);
  }
  const output = 'public/studio/robot-' + scene + '-v4';
  run(['-framerate', '30', '-start_number', '1', '-i', input + '/%04d.png', '-frames:v', '180', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output + '.mp4']);
  run(['-i', input + '/0001.png', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '90', output + '.webp']);
  console.log(JSON.stringify({ scene, frames: 180, fps: 30, seconds: 6, bytes: statSync(output + '.mp4').size }));
}

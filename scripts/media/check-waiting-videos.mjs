import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function validateVideoEntry(entry, bytes, probe) {
  assert.equal(entry.status, 'approved');
  assert.match(entry.reviewedBy, /\S+/);
  assert.match(entry.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(entry.sha256, sha(bytes), '검수한 파일의 해시');
  assert.equal(entry.src, `/studio/waiting-video-v1/${String(entry.id).padStart(2, '0')}-${entry.sha256.slice(0, 12)}.mp4`);
  assert.ok(bytes.length <= 4 * 1024 * 1024, '모바일 다운로드: 편당 4MiB 이하');
  const video = probe.streams.filter(stream => stream.codec_type === 'video');
  assert.equal(video.length, 1); assert.equal(probe.streams.length, 1, '무음 파일: 오디오·추가 트랙 없음');
  const stream = video[0];
  assert.equal(stream.codec_name, 'h264'); assert.equal(stream.pix_fmt, 'yuv420p');
  assert.equal(stream.width, stream.height, '승인 원화와 동일한 정사각형');
  assert.ok(stream.width >= 704 && stream.width <= 1440, '704~1440px 원본 구도');
  const [n, d] = stream.avg_frame_rate.split('/').map(Number), fps = n / d;
  assert.ok(fps >= 24 && fps <= 30.01, '24~30fps 연속 프레임');
  assert.ok(Math.abs(Number(probe.format.duration) - 3) <= 0.12, '3초 실제 동작');
  const moov = bytes.indexOf(Buffer.from('moov')), mdat = bytes.indexOf(Buffer.from('mdat'));
  assert.ok(moov >= 0 && mdat > moov, '빠른 재생 시작용 faststart');
}

export function checkWaitingVideos({ requireComplete = false } = {}) {
  const base = '_docs/intents/2026-09-30-studio-design-integration';
  const archive = `${base}/loading-approved-2026-10-01`;
  const follow = `${base}/video-followup-2026-10-03`;
  const mapping = JSON.parse(fs.readFileSync(`${follow}/asset-map.json`, 'utf8'));
  const sets = JSON.parse(fs.readFileSync(`${archive}/assets/sets.json`, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('src/studio/waiting-videos.json', 'utf8'));
  assert.equal(manifest.length, 12); assert.equal(mapping.length, 12);
  assert.deepEqual(manifest.map(entry => entry.id), Array.from({ length: 12 }, (_, i) => i + 1));
  let approved = 0;
  for (const entry of manifest) {
    const record = mapping.find(item => item.id === entry.id), id = String(entry.id).padStart(2, '0');
    assert.equal(record.sourceSha256, sha(fs.readFileSync(record.source)), `${id} 원본 해시`);
    assert.deepEqual(fs.readFileSync('public' + record.fallback), fs.readFileSync(`${archive}/assets/${id}.webp`), `${id} 대체 원화 보존`);
    assert.deepEqual(fs.readFileSync(`${follow}/${record.prompt}`), fs.readFileSync(`${archive}/assets/${id}-영상-프롬프트.txt`), `${id} 승인 프롬프트 보존`);
    assert.equal(record.motion, sets.find(item => item.id === entry.id).motion);
    if (entry.status === 'awaiting-generation') {
      assert.equal(entry.src, null); assert.equal(entry.sha256, null);
      continue;
    }
    assert.equal(entry.status, 'approved', '미제작 또는 검수 승인만 허용');
    assert.match(entry.src, /^\/studio\/waiting-video-v1\/\d{2}-[a-f0-9]{12}\.mp4$/);
    const file = path.resolve('public' + entry.src), bytes = fs.readFileSync(file);
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `ffprobe 실패: ${result.error?.message || result.stderr}`);
    validateVideoEntry(entry, bytes, JSON.parse(result.stdout)); approved++;
  }
  const report = { total: manifest.length, approved, pending: manifest.length - approved, assetsAndPromptsPreserved: true };
  if (requireComplete) assert.equal(approved, 12, '미제작 영상이 남아 있어 영상 마일스톤 완료 불가');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(checkWaitingVideos({ requireComplete: process.argv.includes('--require-complete') })));
}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// 10/1 승인 보관본은 당시 기록이라 고치지 않는다. 그 뒤 Bumm님이 승인한 수정은 prompt-amendments.json에 적고,
// 후속 프롬프트·동작 문구는 «보관본 + 기록된 수정»과 정확히 같아야 한다 — 기록 없는 변경은 여기서 막힌다.
export function applyAmendments(text, amendments, { prompt = false } = {}) {
  let out = text;
  for (const item of amendments) {
    for (const [from, to] of item.replace) out = out.split(from).join(to);
    if (prompt && item.insertAfter !== undefined) {   // 바꾸기만 하는 기록도 있다(넣을 문장이 없으면 건너뛴다)
      assert.equal(out.split(item.insertAfter).length - 1, 1, `${item.date} 수정을 넣을 자리가 프롬프트에 정확히 한 번 있어야 한다`);
      out = out.replace(item.insertAfter, item.insertAfter + item.insert);
    }
  }
  return out;
}
export function validateVideoEntry(entry, bytes, probe) {
  assert.equal(entry.status, 'approved');
  assert.match(entry.reviewedBy, /\S+/);
  assert.match(entry.reviewedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(entry.sha256, sha(bytes), '검수한 파일의 해시');
  assert.equal(entry.src, `/studio/waiting-video-v1/${String(entry.id).padStart(2, '0')}-${entry.sha256.slice(0, 12)}.webm`);
  assert.ok(bytes.length <= 5 * 1024 * 1024, '한 편씩 내려받기: 편당 5MB 이하');
  assert.match(probe.format.format_name, /webm/, '투명 WebM 컨테이너');
  const video = probe.streams.filter(stream => stream.codec_type === 'video');
  assert.equal(video.length, 1); assert.equal(probe.streams.length, 1, '무음 파일: 오디오·추가 트랙 없음');
  const stream = video[0];
  assert.equal(stream.codec_name, 'vp9', 'VP9');
  assert.equal(String(stream.tags?.alpha_mode ?? stream.tags?.ALPHA_MODE), '1', '투명(알파) 채널');
  assert.equal(stream.width, 704, '승인 원화와 같은 704px'); assert.equal(stream.height, 704, '승인 원화와 같은 704px');
  const [n, d] = stream.avg_frame_rate.split('/').map(Number), fps = n / d;
  assert.ok(fps >= 24 && fps <= 30.01, '24~30fps 연속 프레임');
  assert.ok(Math.abs(Number(probe.format.duration) - 8) <= 0.1, '8초(세트 간격과 같은 길이)');
}

export function checkWaitingVideos({ requireComplete = false } = {}) {
  const base = '_docs/intents/2026-09-30-studio-design-integration';
  const archive = `${base}/loading-approved-2026-10-01`;
  const follow = `${base}/video-followup-2026-10-03`;
  const mapping = JSON.parse(fs.readFileSync(`${follow}/asset-map.json`, 'utf8'));
  const sets = JSON.parse(fs.readFileSync(`${archive}/assets/sets.json`, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync('src/studio/waiting-videos.json', 'utf8'));
  const amendments = JSON.parse(fs.readFileSync(`${follow}/prompt-amendments.json`, 'utf8'));
  assert.equal(manifest.length, 12); assert.equal(mapping.length, 12);
  assert.deepEqual(manifest.map(entry => entry.id), Array.from({ length: 12 }, (_, i) => i + 1));
  let approved = 0;
  for (const entry of manifest) {
    const record = mapping.find(item => item.id === entry.id), id = String(entry.id).padStart(2, '0');
    assert.equal(record.sourceSha256, sha(fs.readFileSync(record.source)), `${id} 원본 해시`);
    assert.deepEqual(fs.readFileSync('public' + record.fallback), fs.readFileSync(`${archive}/assets/${id}.webp`), `${id} 대체 원화 보존`);
    const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');   // 줄 끝은 체크아웃 설정마다 달라 비교에서 뺀다
    const approvedPrompt = read(`${archive}/assets/${id}-영상-프롬프트.txt`);
    assert.equal(read(`${follow}/${record.prompt}`), applyAmendments(approvedPrompt, amendments, { prompt: true }), `${id} 승인 프롬프트 + 기록된 수정`);
    assert.equal(record.motion, applyAmendments(sets.find(item => item.id === entry.id).motion, amendments), `${id} 동작 문구 + 기록된 수정`);
    if (entry.status === 'awaiting-generation') {
      assert.equal(entry.src, null); assert.equal(entry.sha256, null);
      continue;
    }
    assert.equal(entry.status, 'approved', '미제작 또는 검수 승인만 허용');
    assert.match(entry.src, /^\/studio\/waiting-video-v1\/\d{2}-[a-f0-9]{12}\.webm$/);
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

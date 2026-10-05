import { test, expect } from 'vitest';
import crypto from 'node:crypto';
import { validateVideoEntry, checkWaitingVideos } from '../scripts/media/check-waiting-videos.mjs';

test('승인 원화·프롬프트 12개 매핑을 보존하고 미제작을 완료로 통과시키지 않는다', () => {
  const result = checkWaitingVideos();
  expect(result.total).toBe(12);
  if (result.pending) expect(() => checkWaitingVideos({ requireComplete: true })).toThrow('완료 불가');
});
test('검수 게이트는 변조·소리·규격·길이·누락된 시각 검수를 거부한다', () => {
  // 메타데이터 검사 단위시험 전용 바이트이며 재생 가능한 영상 또는 완성 자산이 아니다.
  const bytes = Buffer.from('moov____mdat');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const entry = { id: 1, status: 'approved', src: `/studio/waiting-video-v1/01-${digest.slice(0, 12)}.mp4`, sha256: digest, reviewedBy: '검수자', reviewedAt: '2026-10-03' };
  const probe = { streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 704, height: 704, avg_frame_rate: '30/1' }], format: { duration: '3.000' } };
  expect(() => validateVideoEntry(entry, bytes, probe)).not.toThrow();
  expect(() => validateVideoEntry(entry, Buffer.from('tampered'), probe)).toThrow();
  expect(() => validateVideoEntry({ ...entry, reviewedBy: '' }, bytes, probe)).toThrow();
  expect(() => validateVideoEntry({ ...entry, src: 'https://example.com/video.mp4' }, bytes, probe)).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [...probe.streams, { codec_type: 'audio' }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, format: { duration: '1' } })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], width: 800 }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], codec_name: 'hevc' }] })).toThrow();
});

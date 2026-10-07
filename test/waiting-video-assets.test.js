import { test, expect } from 'vitest';
import crypto from 'node:crypto';
import { validateVideoEntry, checkWaitingVideos, applyAmendments } from '../scripts/media/check-waiting-videos.mjs';

test('승인 프롬프트 수정은 기록된 것만 반영하고, 넣을 자리가 정확히 한 번이 아니면 거부한다', () => {
  const amendments = [{ date: '2026-10-06', replace: [['입과 고개가', '고개가']], insertAfter: '유지한다.', insert: ' 얼굴은 원화 그대로.' }];
  expect(applyAmendments('눈을 유지한다. 노래하듯 입과 고개가 움직인다.', amendments, { prompt: true }))
    .toBe('눈을 유지한다. 얼굴은 원화 그대로. 노래하듯 고개가 움직인다.');
  expect(applyAmendments('노래하듯 입과 고개가 움직인다.', amendments)).toBe('노래하듯 고개가 움직인다.');
  expect(() => applyAmendments('자리가 없는 프롬프트', amendments, { prompt: true })).toThrow('정확히 한 번');
  expect(() => applyAmendments('유지한다. 또 유지한다.', amendments, { prompt: true })).toThrow('정확히 한 번');
  // 바꾸기만 하는 기록은 넣을 자리를 요구하지 않는다
  const replaceOnly = [...amendments, { date: '2026-10-07', replace: [['고개가 움직인다', '고개를 끄덕인다']] }];
  expect(applyAmendments('눈을 유지한다. 노래하듯 입과 고개가 움직인다.', replaceOnly, { prompt: true }))
    .toBe('눈을 유지한다. 얼굴은 원화 그대로. 노래하듯 고개를 끄덕인다.');
});

test('승인 원화·프롬프트 12개 매핑을 보존하고 미제작을 완료로 통과시키지 않는다', () => {
  const result = checkWaitingVideos();
  expect(result.total).toBe(12);
  if (result.pending) expect(() => checkWaitingVideos({ requireComplete: true })).toThrow('완료 불가');
});
test('검수 게이트는 변조·소리·규격·길이·투명·누락된 시각 검수를 거부한다', () => {
  // 메타데이터 검사 단위시험 전용 바이트이며 재생 가능한 영상 또는 완성 자산이 아니다.
  const bytes = Buffer.from('webm-metadata-test');
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const entry = { id: 1, status: 'approved', src: `/studio/waiting-video-v1/01-${digest.slice(0, 12)}.webm`, sha256: digest, reviewedBy: '검수자', reviewedAt: '2026-10-05' };
  const probe = { streams: [{ codec_type: 'video', codec_name: 'vp9', pix_fmt: 'yuv420p', width: 704, height: 704, avg_frame_rate: '24/1', tags: { alpha_mode: '1' } }], format: { format_name: 'matroska,webm', duration: '8.000' } };
  expect(() => validateVideoEntry(entry, bytes, probe)).not.toThrow();
  expect(() => validateVideoEntry(entry, Buffer.from('tampered'), probe)).toThrow();
  expect(() => validateVideoEntry({ ...entry, reviewedBy: '' }, bytes, probe)).toThrow();
  expect(() => validateVideoEntry({ ...entry, src: 'https://example.com/video.mp4' }, bytes, probe)).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [...probe.streams, { codec_type: 'audio' }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, format: { ...probe.format, duration: '3.000' } })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, format: { ...probe.format, format_name: 'mov,mp4' } })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], width: 800, height: 800 }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], width: 800 }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], height: 800 }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], codec_name: 'h264' }] })).toThrow();
  expect(() => validateVideoEntry(entry, bytes, { ...probe, streams: [{ ...probe.streams[0], tags: {} }] })).toThrow();
  expect(() => validateVideoEntry({ ...entry, src: entry.src.replace('.webm', '.mp4') }, bytes, probe)).toThrow();
});

/* 현장 의견 내보내기 · 지우기 도구(scripts/ops/feedback-export.mjs, 2026-11-05 Bumm님 9 ①).
   내보낸 json에 적힌 문서만 지우는지 · 엑셀이 수식으로 읽지 않는지 · 다른 json으로는 지우지 않는지를 가짜 Firestore로 고정한다. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { exportFeedback, deleteExported, toCsv, APPS } from '../scripts/ops/feedback-export.mjs';

function fakeDb(docs, collectionName = 'feedback') {
  const store = new Map(docs.map((d) => [d.id, d]));
  const deleted = [];
  const ts = (iso) => ({ toDate: () => new Date(iso) });
  return {
    deleted,
    store,
    collection(name) {
      expect(name).toBe(collectionName);
      return {
        orderBy(field) {
          expect(field).toBe('createdAt');
          return {
            async get() {
              const list = [...store.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
              return { docs: list.map(({ id, createdAt, ...rest }) => ({ id, data: () => ({ ...rest, createdAt: ts(createdAt) }) })) };
            }
          };
        },
        doc: (id) => ({ id })
      };
    },
    batch() {
      const ops = [];
      return {
        delete: (ref) => ops.push(ref.id),
        async commit() { for (const id of ops) { store.delete(id); deleted.push(id); } }
      };
    }
  };
}

const row = (id, createdAt, extra = {}) => ({ id, createdAt, name: '김진행', text: '의견', version: 'index-abc.js', screen: '1366x768@1', device: 'pc', step: 1, ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fb-export-'));

test('내보내기: 받은 시각 순 · 한국 시각 · 엑셀용 BOM · 문서 번호가 든 json', async () => {
  const db = fakeDb([row('b2', '2026-11-14T03:00:00.000Z'), row('a1', '2026-11-14T01:30:00.000Z', { text: '줄\n바꿈 "따옴표"' })]);
  const out = tmp();
  const r = await exportFeedback(db, out, new Date('2026-11-20T00:00:00Z'));
  expect(r.count).toBe(2);
  const csv = fs.readFileSync(r.csvPath, 'utf8');
  expect(csv.startsWith('﻿"받은 시각(한국)","이름","의견"')).toBe(true);
  const lines = csv.slice(1).split('\r\n');
  expect(lines[1]).toBe('"2026-11-14 10:30:00","김진행","줄\n바꿈 ""따옴표""","index-abc.js","1366x768@1","pc","1","a1"');
  expect(lines[2].startsWith('"2026-11-14 12:00:00"')).toBe(true);
  const json = JSON.parse(fs.readFileSync(r.jsonPath, 'utf8'));
  expect(json).toMatchObject({ project: 'inky-poster-studio', collection: 'feedback', count: 2 });
  expect(json.rows.map((x) => x.id)).toEqual(['a1', 'b2']);
  expect(json.rows[0].createdAt).toBe('2026-11-14T01:30:00.000Z');
  expect(db.deleted).toEqual([]);
  // 같은 시각에 다시 내보내도 덮지 않는다
  await expect(exportFeedback(db, out, new Date('2026-11-20T00:00:00Z'))).rejects.toThrow('덮지 않는다');
});

test('CSV: =, +, -, @로 시작하는 칸은 글자로(엑셀 수식 막기)', () => {
  const csv = toCsv([row('x', '2026-11-14T00:00:00Z', { name: '=HYPERLINK("a")', text: '+1', version: '-v', screen: '@s' })]);
  expect(csv).toContain(`"'=HYPERLINK(""a"")","'+1","'-v","'@s"`);
});

test('지우기: 내보낸 json에 적힌 문서만 · 그 뒤에 들어온 의견은 남는다', async () => {
  const db = fakeDb([row('a1', '2026-11-14T01:00:00Z'), row('b2', '2026-11-14T02:00:00Z')]);
  const r = await exportFeedback(db, tmp(), new Date('2026-11-20T00:00:00Z'));
  db.store.set('c3', row('c3', '2026-11-20T01:00:00Z'));
  expect(await deleteExported(db, r.jsonPath)).toEqual({ deleted: 2 });
  expect(db.deleted).toEqual(['a1', 'b2']);
  expect([...db.store.keys()]).toEqual(['c3']);
});

test('지우기: 내보내기 도구가 만든 json이 아니면 하나도 지우지 않는다', async () => {
  const db = fakeDb([row('a1', '2026-11-14T01:00:00Z')]);
  const dir = tmp();
  const bad = [
    { project: 'other', collection: 'feedback', count: 1, rows: [{ id: 'a1' }] },
    { project: 'inky-poster-studio', collection: 'rateLimitBuckets', count: 1, rows: [{ id: 'a1' }] },
    { project: 'inky-poster-studio', collection: 'feedback', count: 2, rows: [{ id: 'a1' }] },
    { project: 'inky-poster-studio', collection: 'feedback', count: 1, rows: [{ id: '../x' }] }
  ];
  for (const [i, data] of bad.entries()) {
    const p = path.join(dir, `bad-${i}.json`);
    fs.writeFileSync(p, JSON.stringify(data));
    await expect(deleteExported(db, p)).rejects.toThrow();
  }
  expect(db.deleted).toEqual([]);
});

/* 2026-11-08 — Voice Cinema 의견도 이 서버가 받는다(앱별 컬렉션). --app voice-cinema는 그 컬렉션만 내보내고, 지우기는 json에 적힌 컬렉션만 지운다. */
test('앱별 컬렉션 표가 서버(functions/index.js FEEDBACK_APPS)와 같다', () => {
  const server = fs.readFileSync(path.join(import.meta.dirname, '..', 'functions', 'index.js'), 'utf8');
  for (const [app, { collection }] of Object.entries(APPS)) {
    const line = server.split(/\r?\n/).find((l) => l.includes(`'${app}': {`));
    expect(line, `서버에 ${app} 줄이 없음`).toBeTruthy();
    expect(line.includes(collection === 'feedback' ? 'collection: FEEDBACK_COLLECTION' : `collection: '${collection}'`), line).toBe(true);
  }
  expect(Object.keys(APPS)).toEqual(['poster-studio', 'voice-cinema']);
});

test('Voice Cinema: feedbackVoiceCinema만 내보내 feedback-voice-cinema-<시각> 파일로 · 그 json으로 지우면 그 컬렉션만', async () => {
  const db = fakeDb([row('v1', '2026-11-13T01:00:00Z', { step: 3 })], 'feedbackVoiceCinema');
  const r = await exportFeedback(db, tmp(), new Date('2026-11-20T00:00:00Z'), 'voice-cinema');
  expect(path.basename(r.csvPath)).toBe('feedback-voice-cinema-202611200900.csv');
  const json = JSON.parse(fs.readFileSync(r.jsonPath, 'utf8'));
  expect(json).toMatchObject({ project: 'inky-poster-studio', collection: 'feedbackVoiceCinema', count: 1 });
  expect(await deleteExported(db, r.jsonPath)).toEqual({ deleted: 1 });
  expect(db.deleted).toEqual(['v1']);
  await expect(exportFeedback(db, tmp(), new Date(), 'calculator')).rejects.toThrow('모르는 앱');
  // 기본 속성 이름도 «모르는 앱»이다(APPS['__proto__']는 Object.prototype이라 그냥 읽으면 참이다).
  for (const name of ['__proto__', 'constructor', 'toString']) {
    await expect(exportFeedback(db, tmp(), new Date(), name)).rejects.toThrow('모르는 앱');
  }
});

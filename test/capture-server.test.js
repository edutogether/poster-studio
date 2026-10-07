/* 스냅샷 수집 서버(scripts/verify/capture-server.mjs)는 같은 컴퓨터의 페이지가 보낸 것만 저장한다.
   기준선 파일을 덮어쓰는 서버라, 다른 사이트에서 온 요청·다른 Host로 들어온 요청은 막혀야 한다. */
import { test, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCaptureServer, MAX_BYTES } from '../scripts/verify/capture-server.mjs';

async function withServer(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-'));
  const server = createCaptureServer(dir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run({ base, dir });
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('수집 서버: 같은 컴퓨터의 페이지와 도구(Origin 없음)는 저장한다', () =>
  withServer(async ({ base, dir }) => {
    const page = await fetch(`${base}/save?name=a`, { method: 'POST', headers: { origin: 'http://localhost:5500' }, body: '{"v":1}' });
    expect(page.status).toBe(200);
    expect(page.headers.get('access-control-allow-origin')).toBe('http://localhost:5500');
    const tool = await fetch(`${base}/save?name=b`, { method: 'POST', body: '{"v":2}' });
    expect(tool.status).toBe(200);
    expect(fs.readdirSync(dir).sort()).toEqual(['a.json', 'b.json']);
  }));

test('수집 서버: 다른 사이트에서 온 요청은 403이고 파일을 쓰지 않는다', () =>
  withServer(async ({ base, dir }) => {
    for (const origin of ['https://example.com', 'http://localhost.example.com', 'null', 'http://127.0.0.1.example.com:5500']) {
      const r = await fetch(`${base}/save?name=x`, { method: 'POST', headers: { origin }, body: '{}' });
      expect(r.status, origin).toBe(403);
      expect(r.headers.get('access-control-allow-origin'), origin).toBeNull();
    }
    expect(fs.readdirSync(dir)).toEqual([]);
  }));

test('수집 서버: 다른 Host 이름으로 들어온 요청은 403이다', () =>
  withServer(async ({ base, dir }) => {
    const { port } = new URL(base);
    const http = await import('node:http');
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/save?name=y', method: 'POST', headers: { host: `attacker.example:${port}` } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end('{}');
    });
    expect(status).toBe(403);
    expect(fs.readdirSync(dir)).toEqual([]);
  }));

test('수집 서버: 한도를 넘는 본문은 저장하지 않는다', () =>
  withServer(async ({ base, dir }) => {
    const body = '"' + 'a'.repeat(MAX_BYTES) + '"';
    const r = await fetch(`${base}/save?name=big`, { method: 'POST', body }).catch((e) => e);
    if (!(r instanceof Error)) expect(r.status).toBe(413);
    expect(fs.readdirSync(dir)).toEqual([]);
  }));

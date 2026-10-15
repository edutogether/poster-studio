#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────
   CI 워크플로(.github/workflows/deploy.yml)의 단계 명령을 이 컴퓨터에서 그대로 실행한다(2026-10-15).

     node scripts/ci/run-workflow-step.mjs "<단계 이름>" ["<단계 이름>" …] [--workflow <파일>]

   GitHub가 정지돼 CI가 돌지 않을 때 로컬 배포 뒤 확인을 CI와 같은 명령으로 하려고 만들었다
   (_docs/ops/runbook.md «GitHub 정지 중 로컬 배포»). 명령을 여기에 베껴 두지 않고 워크플로 파일에서
   꺼내 쓰므로, 확인 기준은 deploy.yml 한 곳에만 있다.
   - 단계는 `- name:` 값이 정확히 같은 것을 찾고, 그 단계의 `run: |` 블록을 Actions와 같은
     `bash --noprofile --norc -eo pipefail`로 실행한다. 저장소 루트에서 실행한다.
   - 단계를 못 찾거나, `run: |` 블록이 없거나 비었거나, `${{ … }}` 식(로컬에서 값을 모름)이 들어 있으면
     실행하지 않고 실패한다 — 찾은 것이 없을 때 조용히 통과하지 않는다.
   - 단계 하나라도 실패하면 종료코드 1.
   ──────────────────────────────────────────────────────────────────── */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const indentOf = (line) => line.length - line.trimStart().length;

/** 워크플로 글에서 이름이 `name`인 단계의 `run: |` 블록을 꺼낸다. 못 찾으면 예외. */
export function extractRun(text, name) {
  const lines = text.split(/\r?\n/);
  const at = lines.findIndex((l) => /^\s*- name:\s*/.test(l) && l.replace(/^\s*- name:\s*/, '').trim() === name);
  if (at < 0) throw new Error(`단계를 못 찾음: «${name}»`);
  const stepIndent = indentOf(lines[at]);
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() && indentOf(l) <= stepIndent) break;   // 다음 단계·다음 잡
    const m = /^(\s*)run:\s*\|\s*$/.exec(l);
    if (!m) continue;
    const keyIndent = m[1].length, body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const b = lines[j];
      if (b.trim() && indentOf(b) <= keyIndent) break;
      body.push(b);
    }
    while (body.length && !body[body.length - 1].trim()) body.pop();
    const first = body.find((b) => b.trim());
    if (!first) throw new Error(`«${name}»의 run 블록이 비었음`);
    const cut = indentOf(first);
    const script = body.map((b) => b.slice(cut)).join('\n') + '\n';
    if (script.includes('${{')) throw new Error(`«${name}»에 \${{ }} 식이 있어 로컬에서 그대로 실행할 수 없음`);
    return script;
  }
  throw new Error(`«${name}»에 run: | 블록이 없음`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const wi = args.indexOf('--workflow');
  const workflow = wi >= 0 ? args.splice(wi, 2)[1] : '.github/workflows/deploy.yml';
  if (!args.length) {
    console.error('사용: node scripts/ci/run-workflow-step.mjs "<단계 이름>" … [--workflow <파일>]');
    process.exit(2);
  }
  const text = fs.readFileSync(workflow, 'utf8');
  let failed = 0;
  for (const name of args) {
    let script;
    try { script = extractRun(text, name); } catch (err) { console.error(`::error::${err.message}`); failed++; continue; }
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-step-')), 'step.sh');
    fs.writeFileSync(file, script);
    console.log(`── ${name} ──`);
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', file], { stdio: 'inherit' });
    const code = r.status ?? 1;
    console.log(`── ${name}: 종료코드 ${code} ──`);
    if (code !== 0) failed++;
  }
  process.exit(failed ? 1 : 0);
}

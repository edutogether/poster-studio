#!/usr/bin/env node
/* 화면 편집판 설치(2026-10-23) — 빌드본(dist)과 편집판을 한 폴더에 담고 바탕화면에 바로 가기를 만든다.

     node scripts/editor/install.mjs <dist 폴더> <설치 폴더>     예: node scripts/editor/install.mjs dist C:\Users\817be\Documents\ps-editor

   설치 폴더: app/(빌드 사본) · editor/(편집판) · server.mjs · «편집판 열기.cmd» · 읽어 주세요.txt. 바탕화면 «Poster Studio 화면 편집판»을 두 번 누르면
   작은 서버가 뜨고 브라우저로 편집판이 열린다(이 컴퓨터에서만). 다시 설치하면 app/과 편집판 파일을 새로 덮는다(바꾼 목록은 브라우저에 남아 있다). */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [distArg, targetArg] = process.argv.slice(2);
if (!distArg || !targetArg) { console.error('사용법: node scripts/editor/install.mjs <dist 폴더> <설치 폴더>'); process.exit(2); }
const dist = path.resolve(distArg), target = path.resolve(targetArg);
const here = path.dirname(fileURLToPath(import.meta.url));
await fs.access(path.join(dist, 'index.html')).catch(() => { console.error('dist에 index.html이 없습니다: ' + dist); process.exit(2); });

await fs.mkdir(target, { recursive: true });
await fs.rm(path.join(target, 'app'), { recursive: true, force: true });
await fs.cp(dist, path.join(target, 'app'), { recursive: true });
await fs.mkdir(path.join(target, 'editor'), { recursive: true });
for (const f of ['index.html', 'editor.js', 'editor.css', 'inject.js']) await fs.copyFile(path.join(here, f), path.join(target, 'editor', f));
await fs.copyFile(path.join(here, 'server.mjs'), path.join(target, 'server.mjs'));
// .cmd는 cmd가 읽는 글자표 문제를 피해 영문만 쓴다(파일 이름은 한글이어도 된다)
await fs.writeFile(path.join(target, '편집판 열기.cmd'), ['@echo off', 'cd /d "%~dp0"', 'node server.mjs', 'pause', ''].join('\r\n'));
await fs.writeFile(path.join(target, '읽어 주세요.txt'), [
  'Poster Studio 화면 편집판',
  '',
  '1. 바탕화면 «Poster Studio 화면 편집판»(또는 이 폴더의 «편집판 열기.cmd»)을 두 번 누릅니다. 검은 창이 뜨고 브라우저로 편집판이 열립니다.',
  '   검은 창을 닫으면 편집판도 꺼집니다.',
  '2. 위에서 갈래(PC · 태블릿 가로 · 태블릿 세로 · 휴대폰)와 화면(시작 화면(로고) ~ 저장)을 고릅니다. 앱이 그 화면까지 저절로 갑니다.',
  '   여는 동안(로딩 · 3단계는 30초쯤)은 고르기 칸이 잠깁니다. 편집판 창을 다른 창으로 가리면 앱의 카운트다운이 멈춰 그만큼 늦어집니다.',
  '   서버 · AI 생성은 부르지 않습니다(카메라는 예시 인물 그림, 포스터는 같은 그림으로 만듭니다).',
  '3. 편집: 요소를 누르면 파란 테두리(고르기). 고른 것을 끌면 옮기고, 모서리 손잡이로 크기를 바꿉니다. 고르지 않은 것은 끌어도 옮겨지지 않습니다.',
  '   여러 개: 고르지 않은 곳에서 마우스를 끌면 상자가 그려지고, 상자 안에 다 든 것들이 한꺼번에 골라집니다. Shift(또는 Ctrl)+누르기로 하나씩 더하기 · 빼기.',
  '   여럿 고른 채로 끌면 함께 옮기고(서로 간격 그대로), 모서리 손잡이는 묶음 전체를 같은 비율로 줄이고 키웁니다. Del · 글자 −/+ · 방향키도 한꺼번에.',
  '   «되돌리기»(Ctrl+Z)는 한꺼번에 한 것을 한 번에 되돌립니다. Esc는 고르기를 풉니다.',
  '   «글자 −/+», «글자 고치기», «숨기기»(Del), 방향키로 1px(Shift 10px) 옮기기. «↑ 감싼 상자»로 더 큰 덩어리를 고릅니다. «앱 조작»으로 바꾸면 앱을 그대로 눌러 볼 수 있습니다.',
  '4. 보기: «맞춤» · «100%»(원본 해상도) · −/+ .',
  '5. 다 고쳤으면 «내보내기» — ps-editor-변경-날짜.json 파일 하나가 내려받아집니다. 이 파일을 세션에 전해 주세요.',
  '   바꾼 것은 이 브라우저에 저장돼 다시 열어도 남아 있습니다(«바꾼 목록»에서 한 줄씩 지우거나 «모두 지우기»).',
  '',
  '앱 코드는 이 편집판이 바꾸지 않습니다. 화면 위에서만 바꾸고, 결과는 목록으로만 나갑니다.',
  '',
].join('\r\n'));

// 바탕화면 바로 가기
const desktop = spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).stdout.trim() || path.join(os.homedir(), 'Desktop');
const lnk = path.join(desktop, 'Poster Studio 화면 편집판.lnk');
const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}'); $s.TargetPath = '${path.join(target, '편집판 열기.cmd').replace(/'/g, "''")}'; $s.WorkingDirectory = '${target.replace(/'/g, "''")}'; $s.Description = 'Poster Studio 화면 편집판'; $s.Save()`;
const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
if (r.status !== 0) { console.error('바로 가기를 만들지 못했습니다: ' + r.stderr); process.exit(1); }
console.log(`설치: ${target}`);
console.log(`바로 가기: ${lnk}`);

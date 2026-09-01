/* ────────────────────────────────────────────────────────────────────
   웹캠 촬영. app.js 분리 작업(2026-08-30)으로 이 파일로 이동, 이어서
   ES모듈 전환(2026-08-30) — 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */
import { $ } from './constants.js';
import { video, snapshot, setStatus } from './dom.js';
import { state } from './state.js';

export async function startCamera(){
  state.stream = await navigator.mediaDevices.getUserMedia({ video:{ width:1280, height:960, facingMode:'user' }, audio:false });
  video.srcObject = state.stream;
  video.classList.remove('hidden'); snapshot.classList.add('hidden');
  $('camHint').classList.add('hidden');
  setStatus('카메라 준비 완료. ‘3·2·1 촬영’을 누르세요.');
}
$('startBtn').onclick = async () => { try{ await startCamera(); }catch(e){ setStatus('카메라를 열 수 없습니다. 브라우저 카메라 권한을 허용해 주세요.'); } };

let snapshotURL = null; // 미리보기 Blob URL(누수 방지용 추적)
$('shotBtn').onclick = async () => {
  if(!state.stream){ try{ await startCamera(); }catch(e){ setStatus('카메라 권한을 허용해 주세요.'); return; } }
  const cd = $('countdown'); cd.classList.remove('hidden');
  for(let i=3;i>0;i--){ cd.textContent=i; await new Promise(r=>setTimeout(r,800)); }
  cd.textContent='📸'; await new Promise(r=>setTimeout(r,250)); cd.classList.add('hidden');

  if(!video.videoWidth){ setStatus('카메라가 아직 준비 중이에요. 1~2초 후 다시 촬영해 주세요.'); return; }
  const MAXW = 1024; // 전송용 축소(AI가 스타일을 새로 그리므로 화질 손해 없음, 업로드 몇 초 단축)
  const scale = Math.min(1, MAXW / video.videoWidth);
  const cap = document.createElement('canvas');
  cap.width = Math.round(video.videoWidth * scale); cap.height = Math.round(video.videoHeight * scale);
  const c = cap.getContext('2d');
  c.translate(cap.width,0); c.scale(-1,1);           // 거울 모드(셀카 느낌)
  c.drawImage(video,0,0,cap.width,cap.height);
  cap.toBlob(blob => {
    if(!blob){ setStatus('촬영에 실패했어요. 다시 시도해 주세요.'); return; }
    state.capturedBlob = blob;
    if(snapshotURL) URL.revokeObjectURL(snapshotURL);  // 이전 미리보기 메모리 해제(장시간 운영 대비)
    snapshotURL = URL.createObjectURL(blob);
    snapshot.src = snapshotURL;
    snapshot.classList.remove('hidden'); video.classList.add('hidden');
    // 6차 감사 발견(2026-09-01): 촬영 후에도 카메라가 계속 켜진 채로 남아 다음 아동이
    // 올 때까지의 공백에도 계속 캡처 중이었다(최소수집 원칙 위반, 아동 대상이라 더 중요) —
    // 촬영이 끝나면 스트림을 실제로 끈다. 다시 촬영(retakeBtn)/재촬영(shotBtn 재클릭) 시 재시작된다.
    if(state.stream){ state.stream.getTracks().forEach(t => t.stop()); state.stream = null; }
    video.srcObject = null;
    setStatus('촬영 완료! 정보를 입력하고 ‘AI 포스터 만들기’를 누르세요.');
    state.genCount = 0; $('regenBtn').disabled = false; $('regenBtn').textContent = '🔄 다른 그림으로';
  }, 'image/jpeg', 0.85);
};
$('retakeBtn').onclick = async () => {
  state.capturedBlob = null;
  $('fallbackBtn').classList.add('hidden'); state.pendingMeta = null;
  state.genCount = 0; $('regenBtn').disabled = false; $('regenBtn').textContent = '🔄 다른 그림으로';
  try{ await startCamera(); }catch(e){ setStatus('카메라 권한을 허용해 주세요.'); }
};

/* ── 개인/단체 토글 ── */
$('modeSeg').querySelectorAll('.seg-btn').forEach(b => b.onclick = () => {
  state.currentMode = b.dataset.mode;
  $('modeSeg').querySelectorAll('.seg-btn').forEach(x=>x.classList.toggle('active', x===b));
  $('soloFields').classList.toggle('hidden', state.currentMode!=='solo');
  $('groupFields').classList.toggle('hidden', state.currentMode!=='group');
});

// 자동 재생 검사용 색상 패턴 전용. public/·배포·사용자 검토 페이지에 포함하지 않는다.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import WaitingArtwork from '../../src/studio/WaitingArtwork';
import '../../src/studio/generation-wait.css';
import '../../src/studio/waiting-art.css';
function Fixture() {
  const [paused, setPaused] = useState(false);
  const [mounted, setMounted] = useState(true);
  const broken = new URLSearchParams(location.search).has('broken');
  return <main><h1>QA 전용 색상 패턴 · 승인 영상 아님</h1>
    {mounted && <div className="generation-film waiting-art-frame" data-art="11">
      <WaitingArtwork image="/studio/waiting-approved-v1/11.webp" theme="시험 대체 원화"
        video={broken ? '/missing.mp4' : '/qa-only.mp4'} paused={paused}
        reduced={matchMedia('(prefers-reduced-motion: reduce)').matches}/>
    </div>}
    <button id="pause" onClick={() => setPaused(value => !value)}>재생/정지</button>
    <button id="unmount" onClick={() => setMounted(false)}>해제</button>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);

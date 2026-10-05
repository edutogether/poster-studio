import { createRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import GenerationWait from '../../src/studio/GenerationWait';
import WaitingArtwork from '../../src/studio/WaitingArtwork';
import { waitingSets } from '../../src/studio/waitingSets';
import { approvedWaitingVideo } from '../../src/studio/waitingVideo';
import './wait-video-preview.css';

function Review() {
  const [selected, setSelected] = useState<number | null>(null);
  const completed = waitingSets.filter(set => approvedWaitingVideo(set.id)).length;
  return <main className="video-review">
    <header><h1>Poster Studio · 로딩 영상 검토</h1>
      <p>검수 완료 영상 {completed}/12편 · 아래 미제작 항목은 승인 원화입니다. 동영상 완성본이 아닙니다.</p>
      <p>원화·문구·8초 전환을 보존합니다. 승인 영상만 8초(세트 간격과 같은 길이) 정방향으로 한 번 재생합니다.</p>
      <a href="/">실제 로딩 화면 미리보기</a> · <a href="/samples.html">기존 승인 자료</a>
    </header>
    <div className="video-review-grid">{waitingSets.map(set => {
      const video = approvedWaitingVideo(set.id), number = String(set.id).padStart(2, '0');
      return <article key={set.id}>
        <div className="video-review-status">{number} · {set.theme} <b>{video ? '승인 영상' : '영상 미제작 · 승인 원화'}</b></div>
        <div className="generation-film waiting-art-frame" data-art={set.id}>
          <WaitingArtwork key={`${set.id}-${selected === set.id}`} image={set.image} theme={set.theme}
            video={selected === set.id ? video : undefined} paused={false} reduced={false}/>
        </div>
        <h2>{set.title}</h2><div className="video-review-dots" aria-hidden="true">● ● ●</div>
        <h3>{set.fact.title}</h3><p>{set.fact.body}</p>
        <div className="video-review-actions">
          {video && <button onClick={() => setSelected(selected === set.id ? null : set.id)}>{selected === set.id ? '원화 보기' : '영상 재생'}</button>}
          <a href={`/?set=${set.id}`}>실제 화면에서 보기</a>
          <a href={`/approved/${number}.png`} download>원본 PNG</a>
          <a href={`/briefs/${number}.txt`} target="_blank" rel="noreferrer">복사할 프롬프트</a>
        </div>
      </article>;
    })}</div>
  </main>;
}
const set = Number(new URLSearchParams(location.search).get('set'));
// 로컬 검토 전용. 실제 카메라·AI·인쇄 흐름을 가져오지 않는다.
createRoot(document.getElementById('root')!).render(location.pathname === '/videos.html'
  ? <Review/> : <GenerationWait spinTextRef={createRef()} initialSetId={set || undefined}/>);

import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import GenerationWait from '../../src/studio/GenerationWait';

// 실제 화면 컴포넌트만 렌더한다. 생성 API·카메라·인쇄 연결 없음.
createRoot(document.getElementById('root')!).render(<GenerationWait spinTextRef={createRef()} />);

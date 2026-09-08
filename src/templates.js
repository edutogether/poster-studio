/* ────────────────────────────────────────────────────────────────────
   포스터 4종 템플릿 — 크레딧 문구 조립 + TEMPLATES 렌더 함수.
   layout.js의 그리기 도구를 사용한다. app.js 분리 작업(2026-08-30)으로
   이 파일로 이동, 이어서 ES모듈 전환(2026-08-30) — 로직 변경 없음.
   ──────────────────────────────────────────────────────────────────── */
import { FEST, DATE, VENUE, EN, W, H } from './constants.js';
import { coverDraw, vignette, grain, setLS, setFitFont, drawTitle, layoutTitle, roundRect, drawOrgLogo } from './layout.js';

// 테스트(public/test/layout.test.js)가 크레딧 문구 조립 로직을 직접 검증할 수
// 있도록 export한다 — TEMPLATES 내부에서만 쓰이던 원래 로직/동작은 그대로.
export function creditMain(m){ return m.mode==='group' ? m.groupName : `주연 · 감독   ${m.name}`; }
export function creditSub(m){ return (m.mode==='group' && m.members) ? `출연  ${m.members}` : ''; }

/* ES모듈 전환 전엔 vm 테스트 하네스가 이 값을 꺼내야 해서 var를 썼는데,
   이제 진짜 export이므로 다시 const로 되돌렸다(동작 동일). */
export const TEMPLATES = [
  /* 1) 클래식 시네마 */
  { label:'클래식', render(ctx,art,m,g){
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,W,H);
    coverDraw(ctx,art,0,0,W,H);
    const gr=ctx.createLinearGradient(0,820,0,H); gr.addColorStop(0,'rgba(5,7,15,0)');
    gr.addColorStop(.42,'rgba(5,7,15,.72)'); gr.addColorStop(1,'rgba(5,7,15,.98)');
    ctx.fillStyle=gr; ctx.fillRect(0,800,W,1000);
    vignette(ctx,W,H,.5); grain(ctx,W,H,.05);
    ctx.textAlign='center'; ctx.fillStyle=g.accent; setLS(ctx,2);
    ctx.font="800 38px 'Pretendard'"; ctx.fillText(FEST, W/2, 1066); setLS(ctx,0);
    const yEnd = drawTitle(ctx, `${m.title}`, g.font, W/2, 1212, 1000, 130, 60, '#fff');
    ctx.fillStyle=g.accent; setFitFont(ctx,800,46,"'Pretendard'",creditMain(m),1080); ctx.fillText(creditMain(m), W/2, Math.max(yEnd+40,1360));
    const sub=creditSub(m); let y=Math.max(yEnd+40,1360);
    if(sub){ ctx.fillStyle='#dfe5f3'; setFitFont(ctx,600,32,"'Pretendard'",sub,1080); ctx.fillText(sub, W/2, y+50); y+=50; }
    ctx.strokeStyle='rgba(255,255,255,.18)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(300,y+95); ctx.lineTo(900,y+95); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font="800 42px 'Pretendard'"; ctx.fillText(`${DATE}   ${VENUE}`, W/2, y+155);
    ctx.fillStyle=g.accent; setLS(ctx,4); ctx.font="400 30px 'Bebas Neue'"; ctx.fillText(EN, W/2, y+215); setLS(ctx,0);
    drawOrgLogo(ctx, W/2, 1758, 40, 'light');
  }},

  /* 2) 타이틀 임팩트 */
  { label:'임팩트', render(ctx,art,m,g){
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,W,H);
    coverDraw(ctx,art,0,0,W,H);
    const gr=ctx.createLinearGradient(0,1000,0,H); gr.addColorStop(0,'rgba(5,7,15,0)'); gr.addColorStop(1,'rgba(5,7,15,.92)');
    ctx.fillStyle=gr; ctx.fillRect(0,1000,W,800); grain(ctx,W,H,.05);
    const tg = `“${m.tagline}”`;
    ctx.textAlign='center'; ctx.fillStyle='#fff'; setFitFont(ctx,700,36,"'Pretendard'",tg,1060);
    ctx.save(); ctx.shadowColor='rgba(0,0,0,.7)'; ctx.shadowBlur=12; ctx.fillText(tg, W/2, 1300); ctx.restore();
    // 그라데이션 골드 제목
    const L=layoutTitle(ctx, m.title, g.font, 1060, 150, 66);
    const lh=L.size*1.04, baseY=1330+L.size*0.7, cx=W/2;
    ctx.font=`900 ${L.size}px ${g.font}`; ctx.textBaseline='middle';
    L.lines.forEach((ln,i)=>{ const y=baseY+i*lh;
      ctx.lineJoin='round'; ctx.strokeStyle='rgba(0,0,0,.85)'; ctx.lineWidth=L.size*0.16; ctx.strokeText(ln,cx,y);
      const gg=ctx.createLinearGradient(0,y-L.size/2,0,y+L.size/2); gg.addColorStop(0,'#fff7df'); gg.addColorStop(.5,g.accent); gg.addColorStop(1,'#c9912a');
      ctx.fillStyle=gg; ctx.fillText(ln,cx,y); });
    const endY=baseY+(L.lines.length-1)*lh;
    ctx.fillStyle='#fff'; setFitFont(ctx,800,40,"'Pretendard'",creditMain(m),1080); ctx.fillText(creditMain(m), W/2, endY+L.size*0.7+30);
    drawOrgLogo(ctx, W/2, 1648, 34, 'light');
    // 하단 골드 띠
    const bar=H-92; ctx.fillStyle=g.accent; ctx.fillRect(0,bar,W,92);
    const barLine = `${FEST}   ·   ${DATE}   ·   ${VENUE}`;
    ctx.fillStyle='#2a1d00'; setFitFont(ctx,800,30,"'Pretendard'",barLine,1140);
    ctx.fillText(barLine, W/2, bar+50);
  }},

  /* 3) 시네마스코프 — 사진은 자르지 않고 검은 띠를 위에 덧씌움(머리 잘림 방지) */
  { label:'시네마', render(ctx,art,m,g){
    ctx.fillStyle='#05070f'; ctx.fillRect(0,0,W,H);
    coverDraw(ctx,art,0,0,W,H);          // 전체 꽉 채움(2:3 동일비율 → 잘림 없음)
    grain(ctx,W,H,.05);
    const top=210, botY=H-340;           // 상단 띠 0~210, 하단 띠 1460~1800
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,top); ctx.fillRect(0,botY,W,H-botY);
    ctx.strokeStyle=g.accent; ctx.globalAlpha=.85; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(80,top); ctx.lineTo(W-80,top); ctx.moveTo(80,botY); ctx.lineTo(W-80,botY); ctx.stroke(); ctx.globalAlpha=1;
    // 상단 띠: 영화제명
    ctx.textAlign='center'; ctx.fillStyle=g.accent; setLS(ctx,3); ctx.font="800 38px 'Pretendard'"; ctx.fillText(FEST, W/2, 104); setLS(ctx,0);
    ctx.fillStyle='#9aa3bd'; setLS(ctx,5); ctx.font="400 24px 'Bebas Neue'"; ctx.fillText(EN, W/2, 156); setLS(ctx,0);
    // 하단 띠: 제목/크레딧/날짜/로고
    const yEnd=drawTitle(ctx, m.title, g.font, W/2, botY+100, 1020, 94, 50, '#fff');
    ctx.fillStyle=g.accent; setFitFont(ctx,800,36,"'Pretendard'",creditMain(m),1060); ctx.fillText(creditMain(m), W/2, yEnd+28);
    ctx.fillStyle='#cfd6e8'; ctx.font="700 30px 'Pretendard'"; ctx.fillText(`${DATE}   ${VENUE}`, W/2, yEnd+70);
    drawOrgLogo(ctx, W/2, 1772, 30, 'light');
  }},


  /* 4) 포토카드(기념 프레임) */
  { label:'포토카드', render(ctx,art,m,g){
    ctx.fillStyle='#f3e9d2'; ctx.fillRect(0,0,W,H);
    grain(ctx,W,H,.04);
    const ix=90, iy=96, iw=W-180, ih=1180;
    ctx.save(); roundRect(ctx,ix,iy,iw,ih,26); ctx.clip(); coverDraw(ctx,art,ix,iy,iw,ih,0.12); ctx.restore();
    roundRect(ctx,ix,iy,iw,ih,26); ctx.strokeStyle='rgba(40,30,10,.25)'; ctx.lineWidth=3; ctx.stroke();
    ctx.save(); roundRect(ctx,ix+8,iy+8,iw-16,ih-16,20); ctx.strokeStyle=g.accent; ctx.lineWidth=2; ctx.globalAlpha=.8; ctx.stroke(); ctx.restore();
    const navy='#10183a';
    ctx.textAlign='center'; ctx.fillStyle=g.accent==='#fff'?'#b8902f':g.accent; setLS(ctx,2);
    ctx.font="800 32px 'Pretendard'"; ctx.fillText(FEST, W/2, 1356); setLS(ctx,0);
    const yEnd=drawTitle(ctx, m.title, "'Noto Serif KR'", W/2, 1440, 980, 104, 54, navy, false);
    ctx.strokeStyle=g.accent; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(W/2-80,yEnd+8); ctx.lineTo(W/2+80,yEnd+8); ctx.stroke();
    ctx.fillStyle=navy; setFitFont(ctx,700,40,"'Noto Serif KR'",creditMain(m),960); ctx.fillText(creditMain(m), W/2, yEnd+62);
    let y=yEnd+62; const sub=creditSub(m);
    if(sub){ ctx.fillStyle='#41506f'; setFitFont(ctx,500,27,"'Pretendard'",sub,980); ctx.fillText(sub, W/2, y+44); y+=44; }
    ctx.fillStyle='#41506f'; ctx.font="700 33px 'Pretendard'"; ctx.fillText(`${DATE}   ·   ${VENUE}`, W/2, y+58); y+=58;
    drawOrgLogo(ctx, W/2, Math.min(y+64, 1762), 38, 'dark');
  }},
];

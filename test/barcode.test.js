// 에디토리얼 «잡지 표지»의 ISBN 바코드(src/templates.ts의 ean13 · ean13Modules, 2026-10-17 Bumm님
// «ISBN 바코드 부분만 좀 더 현실적으로»). 그림으로만 보면 막대가 그럴듯해도 규칙과 다를 수 있으므로,
// 확인 숫자를 알려진 ISBN으로 맞춰 보고, 만든 막대를 표준 부호표로 «거꾸로 읽어» 같은 숫자가 나오는지 본다.
import { test, expect } from 'vitest';
import { loadApp } from './load-app.js';

const app = await loadApp();
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const FIRST = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const bits = (mods) => mods.map((on) => (on ? '1' : '0')).join('');

/** EAN-13 막대 95칸을 읽어 13자리로 되돌린다(양끝·가운데 막대 확인 포함). */
function decode13(s) {
  if (s.length !== 95 || s.slice(0, 3) !== '101' || s.slice(45, 50) !== '01010' || s.slice(92) !== '101') return null;
  let parity = '', left = '', right = '';
  for (let i = 0; i < 6; i++) {
    const w = s.slice(3 + 7 * i, 10 + 7 * i);
    if (L.includes(w)) { parity += 'L'; left += L.indexOf(w); } else if (G.includes(w)) { parity += 'G'; left += G.indexOf(w); } else return null;
  }
  for (let i = 0; i < 6; i++) { const w = s.slice(50 + 7 * i, 57 + 7 * i); if (!R.includes(w)) return null; right += R.indexOf(w); }
  const first = FIRST.indexOf(parity);
  return first < 0 ? null : `${first}${left}${right}`;
}

test('확인 숫자: 알려진 ISBN·EAN과 같다', () => {
  expect(app.ean13('978030640615')).toBe('9780306406157');
  expect(app.ean13('400638133393')).toBe('4006381333931');
  expect(app.ean13('979112026114')).toBe('9791120261143');   // 포스터에 찍는 번호
});

test('EAN-13 막대: 95칸이고, 표준 부호표로 거꾸로 읽으면 같은 13자리가 나온다', () => {
  for (const code of ['9780306406157', '4006381333931', '9791120261143', '0000000000000', '5901234123457']) {
    const s = bits(app.ean13Modules(code));
    expect(s).toHaveLength(95);
    expect(decode13(s)).toBe(code);
  }
});

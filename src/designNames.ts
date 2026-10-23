/* 화면에 보이는 디자인 이름 — PC 3단계 썸네일 아래 · 휴대폰 3단계 포스터 아래(2026-10-23 Bumm님 «아이들 대상이라 한글로», 팀장 전달).
   10/20 휴대폰 · 10/23 PC에서 영어로 바꿨던 것을 되돌렸다. 글자 · 띄어쓰기는 10/23 Bumm님이 준 그대로다(«필름 스트립»은 두 낱말 —
   templates.ts의 label «필름스트립»과 다르다). 읽기 도구가 읽는 이름도 이것을 쓴다(보이는 이름과 같게).
   디자인을 더하면 여기도 더한다(test/design-names.test.ts). */
export const DESIGN_NAMES: Record<string, string> = {
  "시네마": "시네마",
  "에디토리얼": "에디토리얼",
  "컬러 블록": "컬러 블록",
  "아치 프레임": "아치 프레임",
  "필름스트립": "필름 스트립",
  "폴라로이드": "폴라로이드",
  "타이포그래피": "타이포그래피",
  "트립틱": "트립틱",
};

export function designName(label: string) {
  return DESIGN_NAMES[label] ?? label;
}

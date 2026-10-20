/* 휴대폰 3단계 포스터 아래에 보이는 디자인 이름(2026-10-20 Bumm님 «디자인 이름을 영어로», 팀장 전달).
   PC 썸네일 이름 · 읽기 도구용 이름은 한글(templates.ts의 label) 그대로다. 디자인을 더하면 여기도 더한다(test/design-names.test.ts). */
export const DESIGN_NAMES_EN: Record<string, string> = {
  "시네마": "Cinema",
  "에디토리얼": "Editorial",
  "컬러 블록": "Color Block",
  "아치 프레임": "Arch Frame",
  "필름스트립": "Filmstrip",
  "폴라로이드": "Polaroid",
  "타이포그래피": "Typography",
  "트립틱": "Triptych",
};

export function designNameEn(label: string) {
  return DESIGN_NAMES_EN[label] ?? label;
}

import { test, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectStrings } from "../scripts/fonts/charset.mjs";

test("하위 컴포넌트의 JSX 본문·속성과 CSS 문구도 폰트 검사에 포함한다", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "poster-fonts-"));
  try {
    fs.mkdirSync(path.join(root, "src", "nested"), { recursive: true });
    for (const file of ["index.html", "privacy.html"])
      fs.writeFileSync(path.join(root, file), "<p>안내</p>");
    fs.writeFileSync(
      path.join(root, "src", "nested", "View.tsx"),
      '<p aria-label="촬영">쥁 주인공</p>',
    );
    fs.writeFileSync(
      path.join(root, "src", "nested", "view.css"),
      '.tip::before{content:"※"}',
    );
    const text = collectStrings(root).join("");
    for (const word of ["촬영", "쥁 주인공", "※"]) expect(text).toContain(word);
  } finally {
    fs.rmSync(root, { recursive: true });
  }
});

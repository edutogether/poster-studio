import { useRef, useState } from "react";

const separator = /[,\.·/|;\s]+/u;

/** 출연진 표시만 태그로 바꾸고, 기존 조판 입력 #members의 쉼표 형식은 유지한다. */
export default function MemberField({ onChange }: { onChange: () => void }) {
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const value = useRef<HTMLInputElement>(null);
  const update = (next: string[], text: string) => {
    setNames(next);
    setDraft(text);
    if (value.current)
      value.current.value = [...next, text.trim()].filter(Boolean).join(", ");
    onChange();
  };
  const commit = (text: string, includeLast = false) => {
    if (composing.current) {
      update(names, text);
      return;
    }
    const parts = text.split(separator);
    const last = includeLast ? "" : (parts.pop() ?? "");
    update([...names, ...parts.filter(Boolean)], last);
  };

  return (
    <div className="field members-field" id="membersField">
      <label htmlFor="memberDraft">출연진 이름</label>
      <input
        id="members"
        type="hidden"
        ref={value}
        value={[...names, draft.trim()].filter(Boolean).join(", ")}
        readOnly
      />
      <div className="member-editor">
        <span id="memberTokens" role="list" aria-label="입력한 출연진">
          {names.map((name, index) => (
            <span className="member-chip" role="listitem" key={index}>
              <span>{name}</span>
              <button
                type="button"
                className="member-remove"
                aria-label={`${name} 삭제`}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  update(
                    names.filter((_, i) => i !== index),
                    draft,
                  );
                  input.current?.focus();
                }}
              >
                ×
              </button>
            </span>
          ))}
        </span>
        <input
          id="memberDraft"
          ref={input}
          value={draft}
          autoComplete="off"
          maxLength={Math.max(
            0,
            120 - names.join(", ").length - (names.length ? 2 : 0),
          )}
          placeholder={
            names.length ? "이름 추가" : "구성원 이름을 모두 입력해 주세요"
          }
          onChange={(event) => commit(event.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            commit(event.currentTarget.value);
          }}
          onBlur={(event) => commit(event.currentTarget.value, true)}
          onPaste={(event) => {
            event.preventDefault();
            const el = event.currentTarget;
            const text = event.clipboardData
              .getData("text/plain")
              .replace(/[\r\n\t]+/g, " ");
            const start = el.selectionStart ?? draft.length,
              end = el.selectionEnd ?? start;
            const room = Math.max(0, el.maxLength - draft.length + end - start);
            commit(
              draft.slice(0, start) + text.slice(0, room) + draft.slice(end),
            );
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || composing.current) return;
            if (event.key === "Enter") {
              event.preventDefault();
              commit(draft, true);
            }
            if (event.key === "Backspace" && !draft && names.length) {
              event.preventDefault();
              update(names.slice(0, -1), "");
            }
          }}
        />
      </div>
    </div>
  );
}

import { useState } from "react";
import { useT } from "@/i18n";

/** A task key, or a link that contains one (…/browse/ABC-123). */
export const keyFrom = (text: string): string | null => text.toUpperCase().match(/\b([A-Z][A-Z0-9_]+-\d+)\b/)?.[1] ?? null;

/** Opens any task or epic by its number, without looking for it on the board. */
export function OpenByKey({ onOpen }: { onOpen: (key: string) => void }) {
  const m = useT().dashboard;
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  const go = () => {
    const k = keyFrom(text);
    setBad(!k);
    if (k) { onOpen(k); setText(""); }
  };
  return (
    <form className={`dash-open ${bad ? "bad" : ""}`} onSubmit={(e) => { e.preventDefault(); go(); }}>
      <input value={text} placeholder={m.openKey} title={bad ? m.openKeyBad : m.openKeyTip} onChange={(e) => { setText(e.target.value); setBad(false); }} />
      <button type="submit" aria-label={m.openKeyGo}>→</button>
    </form>
  );
}

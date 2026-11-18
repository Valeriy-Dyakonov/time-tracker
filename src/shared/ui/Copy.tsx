import { useState } from "react";
import { useT } from "@/i18n";
import { Button } from "./kit";

/** Copies text to the clipboard and reports success for a moment, so the button can show a check mark. */
function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [ok, setOk] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setOk(true);
      setTimeout(() => setOk(false), 1200);
    } catch {
      /* clipboard blocked */
    }
  };
  return [ok, copy];
}

export function CopyButton(props: { text: () => string; label?: string; title?: string }) {
  const all = useT();
  const [ok, copy] = useCopy();
  return (
    <Button variant="ghost" size="small" title={props.title ?? all.shell.ui.copyTitle} onClick={() => copy(props.text())}>
      {ok ? "✓" : (props.label ?? all.common.copy)}
    </Button>
  );
}

/** The value itself is the button: what you paste into Tempo. */
export function CopyChip({ text, label, wide, title }: { text: string; label?: string; wide?: boolean; title?: string }) {
  const t = useT().shell.ui;
  const [ok, copy] = useCopy();
  return (
    <button className={`copychip ${ok ? "ok" : ""} ${wide ? "wide" : ""}`} title={title ?? t.clickToCopy} onClick={() => copy(text)}>
      <span className="cc-text">{label ?? text}</span>
      <span className="cc-ic">{ok ? "✓" : "⧉"}</span>
    </button>
  );
}

export function CopyIcon({ text, title }: { text: string; title?: string }) {
  const t = useT().shell.ui;
  const [ok, copy] = useCopy();
  return (
    <button className={`copyicon ${ok ? "ok" : ""}`} title={title ?? t.copyTitle} onClick={() => copy(text)}>
      {ok
        ? <svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" /></svg>
        : <svg viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5" /></svg>}
    </button>
  );
}

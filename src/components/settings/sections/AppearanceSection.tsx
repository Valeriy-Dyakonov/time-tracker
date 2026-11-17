import type { CSSProperties } from "react";
import { setTheme, SYSTEM_DARK_PREVIEW, THEMES, useTheme, type ThemeInfo } from "../../../theme";
import { SectionCard } from "../parts";

const vars = (p: ThemeInfo["preview"]) => ({
  "--p-bg": p.bg, "--p-card": p.card, "--p-text": p.text, "--p-muted": p.muted, "--p-line": p.line, "--p-accent": p.accent,
}) as CSSProperties;

function Preview({ t }: { t: ThemeInfo }) {
  return (
    <span className="tp" style={vars(t.preview)}>
      <span className="tp-bar" />
      <span className="tp-body">
        <span className="tp-line" />
        <span className="tp-line short" />
        <span className="tp-row"><span className="tp-btn" /><span className="tp-chip" /></span>
      </span>
      {t.id === "system" && (
        <span className="tp-auto" style={vars(SYSTEM_DARK_PREVIEW)}>
          <span className="tp" style={{ height: "100%", border: 0, borderRadius: 0 }}>
            <span className="tp-bar" />
            <span className="tp-body"><span className="tp-line" /><span className="tp-line short" /><span className="tp-row"><span className="tp-btn" /><span className="tp-chip" /></span></span>
          </span>
        </span>
      )}
    </span>
  );
}

export function AppearanceSection() {
  const current = useTheme();
  return (
    <SectionCard title="Оформление" tip="Цветовая тема приложения. Применяется сразу и запоминается на этом компьютере — кнопку «Сохранить» нажимать не нужно.">
      <div className="themes" role="radiogroup" aria-label="Тема оформления">
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={current === t.id} className={`theme-card ${current === t.id ? "on" : ""}`} onClick={() => setTheme(t.id)}>
            <Preview t={t} />
            <span className="tc-name">
              {t.label}
              {current === t.id && <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>}
            </span>
            <span className="tc-sub">{t.sub}</span>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

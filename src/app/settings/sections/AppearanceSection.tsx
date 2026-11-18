import type { CSSProperties } from "react";
import { setTheme, SYSTEM_DARK_PREVIEW, THEMES, themeText, useTheme, type ThemeInfo } from "@/shared/theme";
import { SectionCard } from "../parts";
import { LOCALES, setLocale, useLocale, useT } from "@/i18n";
import { Segmented } from "@/shared/ui";

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

function LanguagePicker() {
  const locale = useLocale();
  const m = useT().settings.language;
  return (
    <SectionCard title={m.title} tip={m.tip}>
      <Segmented value={locale} onChange={setLocale} options={LOCALES.map((l) => ({ value: l.id, label: l.label }))} />
    </SectionCard>
  );
}

export function AppearanceSection() {
  const current = useTheme();
  const m = useT().settings.appearance;
  return (
    <>
    <LanguagePicker />
    <SectionCard title={m.title} tip={m.tip}>
      <div className="themes" role="radiogroup" aria-label={m.groupLabel}>
        {THEMES.map((t) => (
          <button key={t.id} role="radio" aria-checked={current === t.id} className={`theme-card ${current === t.id ? "on" : ""}`} onClick={() => setTheme(t.id)}>
            <Preview t={t} />
            <span className="tc-name">
              {themeText(t.id).label}
              {current === t.id && <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>}
            </span>
            <span className="tc-sub">{themeText(t.id).sub}</span>
          </button>
        ))}
      </div>
    </SectionCard>
    </>
  );
}

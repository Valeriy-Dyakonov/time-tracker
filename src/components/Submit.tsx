import { useEffect, useMemo, useState } from "react";
import type { Analysis } from "../types";
import { api } from "../api";
import { formatRu, weekdayName } from "../lib/dates";
import { dayTotal } from "../lib/allocate";
import { fmtH, weeksOf } from "../lib/report";
import { parseNarrative } from "../lib/prompt";
import {
  fmtTempo, rowId, WEEK_SYSTEM, weekHours, weekPrompt, weekText, weekTitle, worklogRows, type HoursFormat, type WorklogRow,
} from "../lib/submit";
import IssueLink from "./IssueLink";
import { keyColor } from "./ui";

/** useState that survives tab switches and restarts (per analysis period). */
function useStored<T>(key: string, init: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? (JSON.parse(s) as T) : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
  }, [key, v]);
  return [v, setV];
}

/** A value that is copied on click: the thing you paste into Tempo. */
function CopyChip({ text, label, wide }: { text: string; label?: string; wide?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className={`copychip ${ok ? "ok" : ""} ${wide ? "wide" : ""}`}
      title="Нажмите, чтобы скопировать"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1200);
        } catch { /* clipboard blocked */ }
      }}
    >
      <span className="cc-text">{label ?? text}</span>
      <span className="cc-ic">{ok ? "✓" : "⧉"}</span>
    </button>
  );
}

/** Copy icon inside a text field. */
function CopyIcon({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className={`copyicon ${ok ? "ok" : ""}`}
      title="Скопировать описание"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); } catch { /* clipboard blocked */ }
      }}
    >
      {ok
        ? <svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" /></svg>
        : <svg viewBox="0 0 16 16"><rect x="5" y="5" width="8.5" height="8.5" rx="1.5" /><path d="M10.5 5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5H5" /></svg>}
    </button>
  );
}

type Group = "tasks" | "days";

/** Marks a row from a day without own data: worth a glance before submitting. */
const Est = () => <span className="est" title="День без данных: часы взяты по соседним дням, описание типовое. Проверьте перед списанием.">≈</span>;

export default function Submit({ a, canAi }: { a: Analysis; canAi: boolean }) {
  const id = `worklog.submit.${a.start}_${a.end}`;
  const [done, setDone] = useStored<Record<string, boolean>>(`${id}.done`, {});
  const [comments, setComments] = useStored<Record<string, string>>(`${id}.comments`, {});
  const [fmt, setFmt] = useStored<HoursFormat>("worklog.submit.fmt", "hm");
  const [group, setGroup] = useState<Group>("tasks");

  const rows = useMemo(() => worklogRows(a), [a]);
  const doneRows = rows.filter((r) => done[rowId(r)]);
  const sumHours = (rs: WorklogRow[]) => rs.reduce((s, r) => s + r.hours, 0);
  const comment = (r: WorklogRow) => comments[rowId(r)] ?? r.comment;
  const toggle = (r: WorklogRow) => setDone((p) => ({ ...p, [rowId(r)]: !p[rowId(r)] }));

  const line = (r: WorklogRow, showKey: boolean) => {
    const ro = done[rowId(r)];
    return (
      <div className={`wl-row ${showKey ? "by-key" : "by-date"} ${ro ? "done" : ""}`} key={rowId(r)}>
        <button className={`wl-check ${ro ? "on" : ""}`} aria-pressed={!!ro} onClick={() => toggle(r)} title={ro ? "Отмечено как внесённое — снять отметку" : "Отметить, что внёс в Tempo"}>
          <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-6.5" /></svg>
        </button>
        {showKey ? (
          <span className="wl-what"><span className="dot" style={{ background: keyColor(r.key) }} /><IssueLink k={r.key} /><span className="muted wl-title">{a.issues[r.key]?.summary}</span>{r.inferred && <Est />}</span>
        ) : (
          <span className="wl-what"><b className="nw">{weekdayName(r.date)}&nbsp;{formatRu(r.date).slice(0, 5)}</b>{r.inferred && <Est />}</span>
        )}
        <CopyChip text={fmtTempo(r.hours, fmt)} />
        <span className="wl-desc">
          <input
            value={comment(r)}
            onChange={(e) => setComments((p) => ({ ...p, [rowId(r)]: e.target.value }))}
            title="Описание для поля Description — можно поправить"
          />
          <CopyIcon text={comment(r)} />
        </span>
      </div>
    );
  };

  const tasks = useMemo(() => {
    const m = new Map<string, WorklogRow[]>();
    for (const r of rows) m.set(r.key, [...(m.get(r.key) ?? []), r]);
    return [...m.entries()].sort((x, y) => sumHours(y[1]) - sumHours(x[1]));
  }, [rows]);
  const days = useMemo(() => {
    const m = new Map<string, WorklogRow[]>();
    for (const r of rows) m.set(r.date, [...(m.get(r.date) ?? []), r]);
    return [...m.entries()].sort((x, y) => x[0].localeCompare(y[0]));
  }, [rows]);

  const pct = rows.length ? (doneRows.length / rows.length) * 100 : 0;

  return (
    <div className="submit">
      <section className="card step">
        <div className="step-h">
          <span className="step-n">1</span>
          <div>
            <h3>Tempo в Jira — часы по задачам</h3>
            <p className="muted">
              Нажмите на ключ задачи — она откроется в браузере. В Tempo нажмите «Log work» и для каждой строки скопируйте <b>часы</b> и <b>описание</b>
              (клик по значку ⧉), выберите дату и сохраните. Потом поставьте галочку — так не потеряете, где остановились.
            </p>
          </div>
        </div>
        <div className="ts-bar">
          <div className="seg small">
            <button className={group === "tasks" ? "on" : ""} onClick={() => setGroup("tasks")}>По задачам</button>
            <button className={group === "days" ? "on" : ""} onClick={() => setGroup("days")}>По дням</button>
          </div>
          <div className="seg small" title="В каком виде копировать часы">
            <button className={fmt === "hm" ? "on" : ""} onClick={() => setFmt("hm")}>2h 30m</button>
            <button className={fmt === "decimal" ? "on" : ""} onClick={() => setFmt("decimal")}>2.5</button>
          </div>
          <span className="progress">
            <span className="pg-bar"><i style={{ width: `${pct}%` }} /></span>
            <span><b>{doneRows.length}</b> из {rows.length} строк · <b>{fmtH(sumHours(doneRows))}</b> из {fmtH(sumHours(rows))}&nbsp;ч</span>
          </span>
          <span className="spacer" />
          {doneRows.length > 0 && <button className="btn small ghost" onClick={() => setDone({})}>Сбросить отметки</button>}
        </div>

        {group === "tasks" ? (
          <div className="wl-grid">
            {tasks.map(([key, rs]) => {
              const d = rs.filter((r) => done[rowId(r)]).length;
              return (
                <article className="wl-card" key={key}>
                  <header>
                    <span className="dot" style={{ background: keyColor(key) }} />
                    <b className="wl-key"><IssueLink k={key} /></b>
                    <span className="wl-ttl" title={a.issues[key]?.summary}>{a.issues[key]?.summary}</span>
                    <span className="spacer" />
                    <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>ч</small></span>
                    <span className={`wl-cnt ${d === rs.length ? "ok" : ""}`}>{d}/{rs.length}</span>
                  </header>
                  {rs.map((r) => line(r, false))}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="wl-grid">
            {days.map(([date, rs]) => (
              <article className="wl-card" key={date}>
                <header>
                  <b className="nw">{weekdayName(date)}, {formatRu(date)}</b>
                  <span className="spacer" />
                  <span className="wl-sum">{fmtH(sumHours(rs))}&nbsp;<small>ч</small></span>
                </header>
                {rs.map((r) => line(r, true))}
              </article>
            ))}
          </div>
        )}
      </section>

      <WeeklyText a={a} id={id} canAi={canAi} />
    </div>
  );
}

function WeeklyText({ a, id, canAi }: { a: Analysis; id: string; canAi: boolean }) {
  const weeks = useMemo(() => weeksOf(a.days), [a]);
  const [texts, setTexts] = useStored<Record<string, string>>(`${id}.weeks`, {});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  async function rewrite(monday: string) {
    const w = weeks.find((x) => x.monday === monday);
    if (!w) return;
    setBusy(monday);
    setErr("");
    try {
      const t = parseNarrative(await api.llmChat(WEEK_SYSTEM, weekPrompt(a, w)));
      if (t) setTexts((p) => ({ ...p, [monday]: t }));
      else setErr("ИИ вернул пустой ответ — текст не изменён.");
    } catch (e) {
      setErr(`Ошибка ИИ: ${e}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card step">
      <div className="step-h">
        <span className="step-n">2</span>
        <div>
          <h3>Своя система — текст за неделю</h3>
          <p className="muted">
            Для каждой недели готов текст. Поправьте при необходимости, нажмите «Копировать» и вставьте в поле недели.
            Часы по дням лежат отдельной кнопкой, если система их спросит.
          </p>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      <div className="wk-grid">
        {weeks.map((w) => {
          const base = weekText(a, w);
          const text = texts[w.monday] ?? base;
          return (
            <article className="wk-card" key={w.monday}>
              <header>
                <b>Неделя {weekTitle(w)}</b>
                <span className="wl-sum sm">{fmtH(weekHours(w))}&nbsp;<small>ч</small></span>
                <span className="spacer" />
                {texts[w.monday] !== undefined && texts[w.monday] !== base && (
                  <button className="linkbtn" onClick={() => setTexts((p) => { const n = { ...p }; delete n[w.monday]; return n; })}>вернуть исходный</button>
                )}
              </header>
              <textarea rows={Math.min(12, Math.max(4, text.split("\n").length + 1))} value={text} onChange={(e) => setTexts((p) => ({ ...p, [w.monday]: e.target.value }))} />
              <div className="row wrap">
                <CopyChip text={text} label="Копировать текст" wide />
                <CopyChip
                  text={w.days.filter((d) => !d.off).map((d) => `${formatRu(d.date)}\t${fmtH(dayTotal(d))}`).join("\n")}
                  label="Часы по дням"
                  wide
                />
                {canAi && (
                  <button className="btn small" disabled={busy !== null} onClick={() => rewrite(w.monday)}>
                    {busy === w.monday ? "Пишу…" : "Написать связным текстом (ИИ)"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

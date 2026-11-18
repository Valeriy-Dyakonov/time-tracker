import { useT } from "@/i18n";
import { InfoTip } from "@/shared/ui";
import type { ContainerType } from "../lib/containers";

/** Which issue types are "epics" for the swimlanes: the types found in the tasks' links, guessed by name until the user picks. */
export function ContainerPicker(props: {
  candidates: ContainerType[];
  active: Set<string>;
  chosen: string[] | null;
  onChange: (types: string[] | null) => void;
}) {
  const m = useT().dashboard;
  const on = props.candidates.filter((c) => props.active.has(c.type.toLowerCase())).map((c) => c.type);
  const toggle = (type: string) => {
    const next = on.includes(type) ? on.filter((t) => t !== type) : [...on, type];
    props.onChange(next);
  };
  return (
    <details className="dash-ctypes">
      <summary>{on.length ? m.containers(on.join(", ")) : m.containersNone}</summary>
      <div className="dash-ctypes-pop">
        <div className="dash-ctypes-h"><b>{m.containersTitle}</b><InfoTip>{m.containersTip}</InfoTip></div>
        {props.candidates.map((c) => (
          <label key={c.type}>
            <input type="checkbox" checked={on.includes(c.type)} onChange={() => toggle(c.type)} />
            <span>{c.type}</span>
            {c.auto && <small className="muted">{m.containersAuto}</small>}
            <span className="spacer" />
            <span className="dash-n">{c.count}</span>
          </label>
        ))}
        {props.chosen !== null && <button className="board-more" onClick={() => props.onChange(null)}>{m.containersReset}</button>}
      </div>
    </details>
  );
}

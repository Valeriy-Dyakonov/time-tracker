import type { ReactNode } from "react";
import { InfoTip } from "@/shared/ui";

export function StepHeader(props: { n: number; title: string; tip?: ReactNode; children: ReactNode }) {
  return (
    <div className="step-h">
      <span className="step-n">{props.n}</span>
      <div>
        <h3>{props.title}{props.tip && <InfoTip wide>{props.tip}</InfoTip>}</h3>
        <p className="muted">{props.children}</p>
      </div>
    </div>
  );
}

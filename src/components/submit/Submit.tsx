import type { Analysis } from "../../types";
import { TempoStep } from "./TempoStep";
import { WeeklyText } from "./WeeklyText";

export default function Submit({ a, canAi }: { a: Analysis; canAi: boolean }) {
  const storeId = `worklog.submit.${a.start}_${a.end}`;
  return (
    <div className="submit">
      <TempoStep a={a} storeId={storeId} />
      <WeeklyText a={a} storeId={storeId} canAi={canAi} />
    </div>
  );
}

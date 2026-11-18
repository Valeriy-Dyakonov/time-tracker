import type { Analysis } from "@/shared/types";
import { TempoStep } from "./tempo/TempoStep";
import { useJiraSync } from "./useJiraSync";
import { WeeklyText } from "./weekly/WeeklyText";

export default function Submit({ a, canAi }: { a: Analysis; canAi: boolean }) {
  const storeId = `worklog.submit.${a.start}_${a.end}`;
  // One read of the user's Jira worklogs: step 1 compares and writes, step 2 builds the weekly text from Tempo.
  const jira = useJiraSync(a);
  return (
    <div className="submit">
      <TempoStep a={a} storeId={storeId} jira={jira} />
      <WeeklyText a={a} storeId={storeId} canAi={canAi} jira={jira} />
    </div>
  );
}

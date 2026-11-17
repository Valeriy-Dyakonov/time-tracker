import { useT } from "../../i18n";
import type { Analysis } from "../../types";
import { daysCsv, markdown, tasksCsv } from "../../lib/report";
import { Button, Card, CopyButton, download, Title } from "../ui";

export function Export({ a }: { a: Analysis }) {
  const t = useT().report.export;
  const name = `worklog_${a.start}_${a.end}`;
  return (
    <Card className="export">
      <Title tip={t.tip}>{t.title}</Title>
      <p className="muted">{t.intro}</p>
      <div className="row wrap">
        <Button title={t.tasksCsvHint} onClick={() => download(`${name}_tasks.csv`, tasksCsv(a), "text/csv")}>{t.tasksCsv}</Button>
        <Button title={t.daysCsvHint} onClick={() => download(`${name}_days.csv`, daysCsv(a), "text/csv")}>{t.daysCsv}</Button>
        <Button title={t.markdownHint} onClick={() => download(`${name}.md`, markdown(a), "text/markdown")}>{t.markdown}</Button>
        <CopyButton label={t.copyMarkdown} title={t.copyMarkdownHint} text={() => markdown(a)} />
      </div>
    </Card>
  );
}

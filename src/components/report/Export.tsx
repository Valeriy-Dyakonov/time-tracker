import type { Analysis } from "../../types";
import { daysCsv, markdown, tasksCsv } from "../../lib/report";
import { Button, Card, CopyButton, download, Title } from "../ui";

export function Export({ a }: { a: Analysis }) {
  const name = `worklog_${a.start}_${a.end}`;
  return (
    <Card className="export">
      <Title tip="Файлы для импорта или архива. CSV открывается в Excel; Markdown — читаемый отчёт для вики, почты или чата.">Выгрузка</Title>
      <p className="muted">Для Jira — строка на каждую пару «день + задача». Для системы по дням — строка на день (со звонками и встречами).</p>
      <div className="row wrap">
        <Button title="Дата, задача, часы, описание — строка на каждую задачу в каждом дне" onClick={() => download(`${name}_tasks.csv`, tasksCsv(a), "text/csv")}>CSV по задачам</Button>
        <Button title="Дата, часы за день, что делали, встречи — строка на день" onClick={() => download(`${name}_days.csv`, daysCsv(a), "text/csv")}>CSV по дням</Button>
        <Button title="Весь отчёт одним документом: итог периода, недели, дни и задачи" onClick={() => download(`${name}.md`, markdown(a), "text/markdown")}>Markdown-отчёт</Button>
        <CopyButton label="Скопировать Markdown" title="Тот же отчёт в буфер обмена — вставить в Confluence, почту или чат" text={() => markdown(a)} />
      </div>
    </Card>
  );
}

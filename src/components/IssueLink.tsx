import { createContext, useContext } from "react";
import { api, inTauri } from "../api";
import { useT } from "../i18n";

/** Jira base URL, provided once in App so any component can render a clickable task key. */
export const JiraUrlContext = createContext("");

export const issueUrl = (base: string, key: string): string => {
  const b = base.trim().replace(/\/+$/, "");
  return b ? `${b}/browse/${key}` : "";
};

/** Task key that opens the issue in the system browser. */
export default function IssueLink({ k, className }: { k: string; className?: string }) {
  const t = useT().shell.issueLink;
  const url = issueUrl(useContext(JiraUrlContext), k);
  if (!url) return <span className={className}>{k}</span>;
  return (
    <a
      href={url}
      className={`ilink ${className ?? ""}`}
      title={t.open(k)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (inTauri) api.openIssue(k).catch(() => {});
        else window.open(url, "_blank");
      }}
    >
      {k}
    </a>
  );
}

import { createContext, useContext } from "react";
import { api, inTauri } from "../api";

/** Jira base URL, provided once in App so any component can render a clickable task key. */
export const JiraUrlContext = createContext("");

export const issueUrl = (base: string, key: string): string => {
  const b = base.trim().replace(/\/+$/, "");
  return b ? `${b}/browse/${key}` : "";
};

/** Task key that opens the issue in the system browser. */
export default function IssueLink({ k, className }: { k: string; className?: string }) {
  const url = issueUrl(useContext(JiraUrlContext), k);
  if (!url) return <span className={className}>{k}</span>;
  return (
    <a
      href={url}
      className={`ilink ${className ?? ""}`}
      title={`Открыть ${k} в браузере`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (inTauri) api.openIssue(k).catch(() => {});
        else window.open(url, "_blank");
      }}
    >
      {k}<span className="ext">↗</span>
    </a>
  );
}

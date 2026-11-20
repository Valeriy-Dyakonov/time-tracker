import type { Mr, Roster } from "@/shared/types";

/** Where the list of MRs is going to be pasted; each system writes links and mentions its own way. */
export type ShareSystem = "matrix" | "slack" | "text";
export const SHARE_SYSTEMS: ShareSystem[] = ["matrix", "slack", "text"];

export interface Recipient {
  id: number;
  name: string;
  /** The person's Matrix ID from the roster, when there is one. */
  matrixId: string | null;
}

interface Format {
  bullet: string;
  link: (label: string, url: string) => string;
  mention: (r: Recipient) => string;
}

const escapeMd = (s: string) => s.replace(/([[\]\\])/g, "\\$1");

const FORMATS: Record<ShareSystem, Format> = {
  // Markdown, which Matrix clients render; a matrix.to link becomes a mention.
  matrix: {
    bullet: "- ",
    link: (label, url) => `[${escapeMd(label)}](${url})`,
    mention: (r) => (r.matrixId ? `[${escapeMd(r.name)}](https://matrix.to/#/${r.matrixId})` : r.name),
  },
  slack: {
    bullet: "• ",
    link: (label, url) => `<${url}|${label.replace(/[<>|]/g, "")}>`,
    mention: (r) => r.name,
  },
  text: {
    bullet: "- ",
    link: (label, url) => `${label} — ${url}`,
    mention: (r) => r.name,
  },
};

/** People of the roster the message can be addressed to, without the user. */
export function recipientsOf(roster: Roster, myGitlab: string): Recipient[] {
  const me = myGitlab.toLowerCase();
  return roster.people
    .filter((p) => !me || !p.accounts.some((a) => a.system === "gitlab" && a.extId.toLowerCase() === me))
    .map((p) => ({
      id: p.id,
      name: p.name,
      matrixId: p.accounts.find((a) => a.system === "matrix" && a.extId.startsWith("@"))?.extId ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The message: the people addressed (a line of their own, when there are any), a line of text, then one line per MR. */
export function buildMessage(system: ShareSystem, mrs: Mr[], recipients: Recipient[], line: string): string {
  const f = FORMATS[system];
  const links = mrs.map((mr) => `${f.bullet}${f.link(mr.title, mr.url)}`).join("\n");
  const to = recipients.map(f.mention).join(", ");
  return `${to ? `${to}\n` : ""}${line.trim()}\n\n${links}`;
}

/** Stable identity of an MR across reloads. */
export const mrId = (mr: Mr) => `${mr.projectId}:${mr.iid}`;

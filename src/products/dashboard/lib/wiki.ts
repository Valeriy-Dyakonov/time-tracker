/**
 * Jira wiki markup (Server/DC descriptions and comments) -> plain blocks for safe rendering:
 * nothing becomes HTML, links are data the UI opens through the backend's http(s)-only command.
 * Covers what people actually write: paragraphs, headings, lists, code/noformat/quote blocks,
 * [text|url] and bare links, *bold*, _italic_, {{mono}}, [~mentions], images, tables.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "code"; v: string }
  | { t: "link"; href: string; v: string }
  | { t: "mention"; v: string }
  | { t: "key"; v: string };

export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "h"; level: number; v: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "code"; v: string }
  | { t: "quote"; lines: Inline[][] }
  | { t: "table"; rows: { head: boolean; v: Inline[] }[][] };

const isWeb = (s: string) => /^https?:\/\//i.test(s);
const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

const INLINE = new RegExp(
  [
    String.raw`\[([^\]|\n]+)\|([^\]\n]+)\]`, // 1,2 [text|url]
    String.raw`\[(https?:\/\/[^\]\s]+)\]`, // 3 [url]
    String.raw`\[~([^\]\n]+)\]`, // 4 [~user]
    String.raw`(https?:\/\/[^\s<>\]"|]+)`, // 5 bare url
    String.raw`\{\{(.+?)\}\}`, // 6 {{mono}}
    String.raw`(?<![\w*])\*(?!\s)([^*\n]+?)\*(?![\w*])`, // 7 *bold*
    String.raw`(?<![\w_])_(?!\s)([^_\n]+?)_(?![\w_])`, // 8 _italic_
    String.raw`!([^!\s|]+\.[a-zA-Z0-9]{2,5})(?:\|[^!\n]*)?!`, // 9 !image.png!
    String.raw`\b([A-Z][A-Z0-9_]+-\d+)\b`, // 10 issue key
  ].join("|"),
  "g",
);

/** Inline markup of one line. `isKey` decides which KEY-1 tokens are real tasks (not "UTF-8"). */
export function parseInline(text: string, isKey: (k: string) => boolean = () => false): Inline[] {
  const out: Inline[] = [];
  const push = (x: Inline) => {
    const last = out[out.length - 1];
    if (x.t === "text" && last?.t === "text") last.v += x.v;
    else if (x.t !== "text" || x.v) out.push(x);
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    push({ t: "text", v: text.slice(at, m.index) });
    at = m.index! + m[0].length;
    if (m[1] !== undefined) {
      const href = m[2].trim();
      if (isWeb(href)) push({ t: "link", href, v: m[1].trim() });
      else if (KEY.test(href) && isKey(href)) push({ t: "key", v: href });
      else push({ t: "text", v: m[1] });
    } else if (m[3] !== undefined) push({ t: "link", href: m[3], v: m[3] });
    else if (m[4] !== undefined) push({ t: "mention", v: m[4] });
    else if (m[5] !== undefined) {
      const url = m[5].replace(/[.,;:!?)]+$/, "");
      push({ t: "link", href: url, v: url });
      push({ t: "text", v: m[5].slice(url.length) });
    } else if (m[6] !== undefined) push({ t: "code", v: m[6] });
    else if (m[7] !== undefined) push({ t: "b", v: m[7] });
    else if (m[8] !== undefined) push({ t: "i", v: m[8] });
    else if (m[9] !== undefined) push({ t: "text", v: `[${m[9]}]` });
    else if (m[10] !== undefined) push(isKey(m[10]) ? { t: "key", v: m[10] } : { t: "text", v: m[10] });
  }
  push({ t: "text", v: text.slice(at) });
  return out;
}

/** Formatting wrappers that carry no meaning in plain text. */
const stripTags = (s: string) => s.replace(/\{(color|panel|anchor)(:[^}]*)?\}/g, "");

/**
 * Cells of a table row: `||` opens a header cell, `|` a plain one. A `|` inside [text|url] or {{mono}}
 * belongs to the cell, not to the table.
 */
export function splitRow(line: string): { head: boolean; text: string }[] {
  const s = line.trim();
  const cells: { head: boolean; text: string }[] = [];
  let cur = "", head = false, started = false, depth = 0, mono = false;
  for (let i = 0; i < s.length; i++) {
    if (s.startsWith("{{", i)) { mono = true; cur += "{{"; i++; continue; }
    if (mono && s.startsWith("}}", i)) { mono = false; cur += "}}"; i++; continue; }
    const c = s[i];
    if (!mono && c === "[") depth++;
    if (!mono && c === "]" && depth > 0) depth--;
    if (c === "|" && depth === 0 && !mono) {
      if (started) cells.push({ head, text: cur.trim() });
      started = true;
      cur = "";
      head = s[i + 1] === "|";
      if (head) i++;
      continue;
    }
    cur += c;
  }
  if (started && cur.trim()) cells.push({ head, text: cur.trim() });
  return cells;
}

export function parseWiki(src: string, isKey?: (k: string) => boolean): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let para: Inline[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", lines: para });
    para = [];
  };
  const inl = (s: string) => parseInline(stripTags(s), isKey);

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const trimmed = line.trim();

    const fence = trimmed.match(/^\{(code|noformat|quote)(:[^}]*)?\}(.*)$/);
    if (fence) {
      flush();
      const tag = fence[1];
      const body: string[] = [];
      const close = `{${tag}}`;
      let rest = fence[3];
      // Single-line {code}x{code}
      if (rest.includes(close)) body.push(rest.slice(0, rest.indexOf(close)));
      else {
        if (rest) body.push(rest);
        while (++n < lines.length) {
          const l = lines[n];
          const i = l.indexOf(close);
          if (i >= 0) { if (i > 0) body.push(l.slice(0, i)); rest = l.slice(i + close.length); break; }
          body.push(l);
        }
      }
      if (tag === "quote") blocks.push({ t: "quote", lines: body.map(inl) });
      else blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }
    if (!trimmed || /^-{4,}$/.test(trimmed)) { flush(); continue; }

    const h = trimmed.match(/^h([1-6])\.\s+(.*)$/);
    if (h) { flush(); blocks.push({ t: "h", level: Number(h[1]), v: inl(h[2]) }); continue; }

    const bq = trimmed.match(/^bq\.\s+(.*)$/);
    if (bq) { flush(); blocks.push({ t: "quote", lines: [inl(bq[1])] }); continue; }

    const li = trimmed.match(/^([*\-#]+)\s+(.*)$/);
    if (li) {
      flush();
      const kind = li[1].startsWith("#") ? "ol" : "ul";
      const last = blocks[blocks.length - 1];
      if (last && last.t === kind) last.items.push(inl(li[2]));
      else blocks.push({ t: kind, items: [inl(li[2])] });
      continue;
    }

    if (trimmed.startsWith("|")) {
      flush();
      const rows: { head: boolean; v: Inline[] }[][] = [];
      for (; n < lines.length && lines[n].trim().startsWith("|"); n++) {
        rows.push(splitRow(lines[n]).map((c) => ({ head: c.head, v: inl(c.text) })));
      }
      n--;
      blocks.push({ t: "table", rows });
      continue;
    }

    para.push(inl(line));
  }
  flush();
  return blocks;
}

/**
 * Jira wiki markup (Server/DC descriptions and comments) -> plain blocks for safe rendering:
 * nothing becomes HTML, links are data the UI opens through the backend's http(s)-only command.
 * Covers what people actually write: paragraphs, headings, lists, code/noformat/quote blocks, tables,
 * [text|url] and bare links, *bold*, _italic_, +underline+, {{mono}}, [~mentions], images, attachments,
 * \\ line breaks, (/) (x) (!) (i) icons, and the braced forms the visual editor writes when formatting
 * touches other characters: {*}bold{*}, {_}italic{_}, {+}..{+}, {-}strike{-}, and the empty {} separator.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b" | "i" | "u" | "s"; v: Inline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; v: string }
  | { t: "mention"; v: string }
  | { t: "key"; v: string }
  | { t: "br" };

export type Block =
  | { t: "p"; lines: Inline[][] }
  | { t: "h"; level: number; v: Inline[] }
  | { t: "ul" | "ol"; items: Inline[][] }
  | { t: "code"; v: string }
  | { t: "quote"; lines: Inline[][] }
  | { t: "table"; rows: { head: boolean; v: Inline[] }[][] };

const isWeb = (s: string) => /^https?:\/\//i.test(s);
const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const ICONS: Record<string, string> = { "/": "✓", x: "✗", "!": "⚠", i: "ℹ", "?": "?", y: "✓", n: "✗", "+": "+", "-": "−" };
const BRACED: Record<string, "b" | "i" | "u" | "s" | null> = { "*": "b", _: "i", "+": "u", "-": "s", "^": null, "~": null, "?": null };

const INLINE = new RegExp(
  [
    String.raw`\{(?<bt>[*_+\-^~?])\}(?<bv>.+?)\{\k<bt>\}`, // {*}bold{*} and friends
    String.raw`\[(?<lt>[^\]|\n]+)\|(?<lu>[^\]\n]+)\]`, // [text|url]
    String.raw`\[(?<bl>https?:\/\/[^\]\s]+)\]`, // [url]
    String.raw`\[~(?<mn>[^\]\n]+)\]`, // [~user]
    String.raw`\[\^(?<att>[^\]\n]+)\]`, // [^attachment.pdf]
    String.raw`(?<url>https?:\/\/[^\s<>\]"|]+)`, // bare url
    String.raw`\{\{(?<mono>.+?)\}\}`, // {{mono}}
    String.raw`(?<![\w*])\*(?!\s)(?<b>[^*\n]+?)\*(?![\w*])`, // *bold*
    String.raw`(?<![\w_])_(?!\s)(?<i>[^_\n]+?)_(?![\w_])`, // _italic_
    String.raw`(?<![\w+])\+(?!\s)(?<u>[^+\n]+?)\+(?![\w+])`, // +underline+
    String.raw`!(?<img>[^!\s|]+\.[a-zA-Z0-9]{2,5})(?:\|[^!\n]*)?!`, // !image.png!
    String.raw`\((?<icon>\/|x|!|i|\?|y|n|\+|-)\)`, // (/) (x) (!) (i)...
    String.raw`(?<br>\\\\)`, // \\ forced line break
    String.raw`\b(?<key>[A-Z][A-Z0-9_]+-\d+)\b`, // issue key
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
  // The empty {} only separates markup from adjacent text: *{}Where{}* is *Where*.
  const src = text.replace(/\{\}/g, "");
  let at = 0;
  for (const m of src.matchAll(INLINE)) {
    const g = m.groups!;
    push({ t: "text", v: src.slice(at, m.index) });
    at = m.index! + m[0].length;
    if (g.bt !== undefined) {
      const kind = BRACED[g.bt];
      if (kind) push({ t: kind, v: parseInline(g.bv, isKey) });
      else for (const x of parseInline(g.bv, isKey)) push(x);
    } else if (g.lt !== undefined) {
      const href = g.lu.trim();
      if (isWeb(href)) push({ t: "link", href, v: g.lt.trim() });
      else if (KEY.test(href) && isKey(href)) push({ t: "key", v: href });
      else push({ t: "text", v: g.lt });
    } else if (g.bl !== undefined) push({ t: "link", href: g.bl, v: g.bl });
    else if (g.mn !== undefined) push({ t: "mention", v: g.mn });
    else if (g.att !== undefined) push({ t: "text", v: `[${g.att}]` });
    else if (g.url !== undefined) {
      const url = g.url.replace(/[.,;:!?)]+$/, "");
      push({ t: "link", href: url, v: url });
      push({ t: "text", v: g.url.slice(url.length) });
    } else if (g.mono !== undefined) push({ t: "code", v: g.mono });
    else if (g.b !== undefined) push({ t: "b", v: parseInline(g.b, isKey) });
    else if (g.i !== undefined) push({ t: "i", v: parseInline(g.i, isKey) });
    else if (g.u !== undefined) push({ t: "u", v: parseInline(g.u, isKey) });
    else if (g.img !== undefined) push({ t: "text", v: `[${g.img}]` });
    else if (g.icon !== undefined) push({ t: "text", v: ICONS[g.icon] ?? m[0] });
    else if (g.br !== undefined) push({ t: "br" });
    else if (g.key !== undefined) push(isKey(g.key) ? { t: "key", v: g.key } : { t: "text", v: g.key });
  }
  push({ t: "text", v: src.slice(at) });
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

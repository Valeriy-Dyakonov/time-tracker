import type { Block, Inline } from "./wiki";

/**
 * Markdown (task notes kept in git) -> the same blocks as Jira markup, so one safe renderer draws both.
 * Covers what such notes use: headings, lists, fenced code, quotes, tables, links, emphasis, inline code.
 */

const INLINE = new RegExp(
  [
    String.raw`!\[(?<img>[^\]]*)\]\([^)]*\)`, // ![alt](src)
    String.raw`\[(?<lt>[^\]]+)\]\((?<lu>[^)\s]+)(?:\s+"[^"]*")?\)`, // [text](url "title")
    String.raw`<(?<al>https?:\/\/[^>\s]+)>`, // <https://...>
    String.raw`(?<url>https?:\/\/[^\s<>)\]]+)`, // bare url
    String.raw`\x60(?<code>[^\x60\n]+)\x60`, // `code`
    String.raw`\*\*(?<b>[^*\n]+?)\*\*|__(?<b2>[^_\n]+?)__`, // **bold**
    String.raw`~~(?<s>[^~\n]+?)~~`, // ~~strike~~
    String.raw`(?<![\w*])\*(?!\s)(?<i>[^*\n]+?)\*(?![\w*])|(?<![\w_])_(?!\s)(?<i2>[^_\n]+?)_(?![\w_])`, // *italic*
    String.raw`\b(?<key>[A-Z][A-Z0-9_]+-\d+)\b`, // task key
  ].join("|"),
  "g",
);

const isWeb = (s: string) => /^https?:\/\//i.test(s);

export function parseMdInline(text: string, isKey: (k: string) => boolean = () => false): Inline[] {
  const out: Inline[] = [];
  const push = (x: Inline) => {
    const last = out[out.length - 1];
    if (x.t === "text" && last?.t === "text") last.v += x.v;
    else if (x.t !== "text" || x.v) out.push(x);
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const g = m.groups!;
    push({ t: "text", v: text.slice(at, m.index) });
    at = m.index! + m[0].length;
    if (g.img !== undefined) push({ t: "text", v: g.img ? `[${g.img}]` : "" });
    else if (g.lt !== undefined) push(isWeb(g.lu) ? { t: "link", href: g.lu, v: g.lt } : { t: "text", v: g.lt });
    else if (g.al !== undefined) push({ t: "link", href: g.al, v: g.al });
    else if (g.url !== undefined) {
      const url = g.url.replace(/[.,;:!?]+$/, "");
      push({ t: "link", href: url, v: url });
      push({ t: "text", v: g.url.slice(url.length) });
    } else if (g.code !== undefined) push({ t: "code", v: g.code });
    else if (g.b !== undefined || g.b2 !== undefined) push({ t: "b", v: parseMdInline(g.b ?? g.b2, isKey) });
    else if (g.s !== undefined) push({ t: "s", v: parseMdInline(g.s, isKey) });
    else if (g.i !== undefined || g.i2 !== undefined) push({ t: "i", v: parseMdInline(g.i ?? g.i2, isKey) });
    else if (g.key !== undefined) push(isKey(g.key) ? { t: "key", v: g.key } : { t: "text", v: g.key });
  }
  push({ t: "text", v: text.slice(at) });
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSeparator = (row: string) => /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(row);

export function parseMarkdown(src: string, isKey?: (k: string) => boolean): Block[] {
  const blocks: Block[] = [];
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  let para: Inline[][] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", lines: para });
    para = [];
  };
  const inl = (s: string) => parseMdInline(s, isKey);

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const trimmed = line.trim();

    const fence = trimmed.match(/^(```|~~~)/);
    if (fence) {
      flush();
      const body: string[] = [];
      while (++n < lines.length && !lines[n].trim().startsWith(fence[1])) body.push(lines[n]);
      blocks.push({ t: "code", v: body.join("\n") });
      continue;
    }
    if (!trimmed || /^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flush(); continue; }

    const h = trimmed.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) { flush(); blocks.push({ t: "h", level: h[1].length, v: inl(h[2]) }); continue; }

    if (trimmed.startsWith(">")) {
      flush();
      const body: Inline[][] = [];
      for (; n < lines.length && lines[n].trim().startsWith(">"); n++) body.push(inl(lines[n].trim().replace(/^>\s?/, "")));
      n--;
      blocks.push({ t: "quote", lines: body });
      continue;
    }

    if (trimmed.startsWith("|") && n + 1 < lines.length && isSeparator(lines[n + 1])) {
      flush();
      const rows = [cells(trimmed).map((c) => ({ head: true, v: inl(c) }))];
      for (n += 2; n < lines.length && lines[n].trim().startsWith("|"); n++) rows.push(cells(lines[n]).map((c) => ({ head: false, v: inl(c) })));
      n--;
      blocks.push({ t: "table", rows });
      continue;
    }

    const li = trimmed.match(/^(?:([-*+])|(\d+)[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/);
    if (li) {
      flush();
      const kind = li[1] ? "ul" : "ol";
      const box = li[3] === undefined ? "" : li[3] === " " ? "☐ " : "☑ ";
      const item = inl(box + li[4]);
      const last = blocks[blocks.length - 1];
      if (last && last.t === kind) last.items.push(item);
      else blocks.push({ t: kind, items: [item] });
      continue;
    }

    para.push(inl(trimmed));
  }
  flush();
  return blocks;
}

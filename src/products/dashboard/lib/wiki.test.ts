import { describe, expect, it } from "vitest";
import { parseInline, parseWiki, splitRow } from "./wiki";

const isKey = (k: string) => k.startsWith("ABC-");

describe("parseInline", () => {
  it("finds links in every form people write them", () => {
    expect(parseInline("see [spec|https://wiki/x?id=1] and https://a.b/c, ok")).toEqual([
      { t: "text", v: "see " },
      { t: "link", href: "https://wiki/x?id=1", v: "spec" },
      { t: "text", v: " and " },
      { t: "link", href: "https://a.b/c", v: "https://a.b/c" },
      { t: "text", v: ", ok" },
    ]);
    expect(parseInline("[https://x.y/z]")).toEqual([{ t: "link", href: "https://x.y/z", v: "https://x.y/z" }]);
  });

  it("never turns a non-web target into a link", () => {
    expect(parseInline("[click|javascript:alert(1)]")).toEqual([{ t: "text", v: "click" }]);
    expect(parseInline("[file|file:///C:/x]")).toEqual([{ t: "text", v: "file" }]);
  });

  it("reads emphasis, mono, mentions, images and only real task keys", () => {
    expect(parseInline("*done* _soon_ {{x.y}} [~ivanov] !shot.png|thumbnail! ABC-12 UTF-8 snake_case_name", isKey)).toEqual([
      { t: "b", v: [{ t: "text", v: "done" }] },
      { t: "text", v: " " },
      { t: "i", v: [{ t: "text", v: "soon" }] },
      { t: "text", v: " " },
      { t: "code", v: "x.y" },
      { t: "text", v: " " },
      { t: "mention", v: "ivanov" },
      { t: "text", v: " [shot.png] " },
      { t: "key", v: "ABC-12" },
      { t: "text", v: " UTF-8 snake_case_name" },
    ]);
  });
});

describe("visual editor markup", () => {
  const T = (v: string) => ({ t: "text", v });

  it("drops the empty {} separator around formatted words", () => {
    expect(parseInline("{}Где искать{}")).toEqual([T("Где искать")]);
    expect(parseInline("*{}Где искать{}*:")).toEqual([{ t: "b", v: [T("Где искать")] }, T(":")]);
    expect(parseWiki("h3. {}Где искать{}")).toEqual([{ t: "h", level: 3, v: [T("Где искать")] }]);
  });

  it("reads braced emphasis next to letters, nested formatting and the rest", () => {
    expect(parseInline("слово{*}жирно{*}слово {_}курсив{_} {-}старое{-} +важно+")).toEqual([
      T("слово"), { t: "b", v: [T("жирно")] }, T("слово "), { t: "i", v: [T("курсив")] }, T(" "),
      { t: "s", v: [T("старое")] }, T(" "), { t: "u", v: [T("важно")] },
    ]);
    expect(parseInline("*см. [спека|https://w/x] и _это_*")).toEqual([
      { t: "b", v: [T("см. "), { t: "link", href: "https://w/x", v: "спека" }, T(" и "), { t: "i", v: [T("это")] }] },
    ]);
    expect(parseInline("a\\\\b (/) готово (x) нет [^log.txt] 1 + 2 C++")).toEqual([
      T("a"), { t: "br" }, T("b ✓ готово ✗ нет [log.txt] 1 + 2 C++"),
    ]);
  });
});

describe("parseWiki", () => {
  it("splits headings, lists, code, quotes and paragraphs", () => {
    const blocks = parseWiki("h2. Steps\n* one\n* two\n# first\n\n{code:java}\nint x = 1;\n{code}\nbq. quoted\nline a\nline b\n\n||A||B||\n|1|2|");
    expect(blocks.map((b) => b.t)).toEqual(["h", "ul", "ol", "code", "quote", "p", "table"]);
    expect(blocks[1]).toEqual({ t: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] });
    expect(blocks[3]).toEqual({ t: "code", v: "int x = 1;" });
    expect(blocks[5]).toEqual({ t: "p", lines: [[{ t: "text", v: "line a" }], [{ t: "text", v: "line b" }]] });
    expect(blocks[6]).toEqual({ t: "table", rows: [
      [{ head: true, v: [{ t: "text", v: "A" }] }, { head: true, v: [{ t: "text", v: "B" }] }],
      [{ head: false, v: [{ t: "text", v: "1" }] }, { head: false, v: [{ t: "text", v: "2" }] }],
    ] });
  });

  it("drops colour wrappers and handles one-line code", () => {
    expect(parseWiki("{code}a=1{code}")).toEqual([{ t: "code", v: "a=1" }]);
    expect(parseWiki("{color:red}warn{color}")).toEqual([{ t: "p", lines: [[{ t: "text", v: "warn" }]] }]);
  });
});

describe("tables", () => {
  it("keeps | inside links and mono text in the cell", () => {
    expect(splitRow("|[spec|https://wiki/x]|{{a|b}}| plain |")).toEqual([
      { head: false, text: "[spec|https://wiki/x]" },
      { head: false, text: "{{a|b}}" },
      { head: false, text: "plain" },
    ]);
  });

  it("reads header cells, mixed rows and empty cells", () => {
    expect(splitRow("||Name||Value||")).toEqual([{ head: true, text: "Name" }, { head: true, text: "Value" }]);
    expect(splitRow("||Row|x||")).toEqual([{ head: true, text: "Row" }, { head: false, text: "x" }]);
    expect(splitRow("|a||c|").map((c) => c.text)).toEqual(["a", "c"]);
    expect(splitRow("|a| |c|").map((c) => c.text)).toEqual(["a", "", "c"]);
  });

  it("renders links inside cells", () => {
    const [t] = parseWiki("||Doc||\n|[spec|https://wiki/x]|");
    expect(t).toEqual({ t: "table", rows: [
      [{ head: true, v: [{ t: "text", v: "Doc" }] }],
      [{ head: false, v: [{ t: "link", href: "https://wiki/x", v: "spec" }] }],
    ] });
  });
});

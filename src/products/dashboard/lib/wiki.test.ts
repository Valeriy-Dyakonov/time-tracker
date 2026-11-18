import { describe, expect, it } from "vitest";
import { parseInline, parseWiki } from "./wiki";

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
      { t: "b", v: "done" },
      { t: "text", v: " " },
      { t: "i", v: "soon" },
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

describe("parseWiki", () => {
  it("splits headings, lists, code, quotes and paragraphs", () => {
    const blocks = parseWiki("h2. Steps\n* one\n* two\n# first\n\n{code:java}\nint x = 1;\n{code}\nbq. quoted\nline a\nline b\n\n||A||B||\n|1|2|");
    expect(blocks.map((b) => b.t)).toEqual(["h", "ul", "ol", "code", "quote", "p", "p"]);
    expect(blocks[1]).toEqual({ t: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }]] });
    expect(blocks[3]).toEqual({ t: "code", v: "int x = 1;" });
    expect(blocks[5]).toEqual({ t: "p", lines: [[{ t: "text", v: "line a" }], [{ t: "text", v: "line b" }]] });
    expect(blocks[6]).toEqual({ t: "p", lines: [[{ t: "text", v: "A  ·  B" }], [{ t: "text", v: "1  ·  2" }]] });
  });

  it("drops colour wrappers and handles one-line code", () => {
    expect(parseWiki("{code}a=1{code}")).toEqual([{ t: "code", v: "a=1" }]);
    expect(parseWiki("{color:red}warn{color}")).toEqual([{ t: "p", lines: [[{ t: "text", v: "warn" }]] }]);
  });
});

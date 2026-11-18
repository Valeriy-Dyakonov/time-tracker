import { describe, expect, it } from "vitest";
import { parseMarkdown, parseMdInline } from "./markdown";

const T = (v: string) => ({ t: "text", v });

describe("markdown", () => {
  it("reads headings, lists with checkboxes, code, quotes and tables", () => {
    const md = "# Plan\n\n- [x] api\n- [ ] ui\n1. one\n\n```ts\nconst a = 1;\n```\n> note\n\n| A | B |\n|---|:-:|\n| 1 | 2 |\n\ntext";
    const b = parseMarkdown(md);
    expect(b.map((x) => x.t)).toEqual(["h", "ul", "ol", "code", "quote", "table", "p"]);
    expect(b[1]).toEqual({ t: "ul", items: [[T("☑ api")], [T("☐ ui")]] });
    expect(b[3]).toEqual({ t: "code", v: "const a = 1;" });
    expect(b[5]).toEqual({ t: "table", rows: [
      [{ head: true, v: [T("A")] }, { head: true, v: [T("B")] }],
      [{ head: false, v: [T("1")] }, { head: false, v: [T("2")] }],
    ] });
  });

  it("reads inline links, emphasis and code, and never links non-web targets", () => {
    expect(parseMdInline("see [spec](https://w/x) **now** `x()` ~~old~~ *it* [local](./a.md)")).toEqual([
      T("see "), { t: "link", href: "https://w/x", v: "spec" }, T(" "), { t: "b", v: [T("now")] }, T(" "),
      { t: "code", v: "x()" }, T(" "), { t: "s", v: [T("old")] }, T(" "), { t: "i", v: [T("it")] }, T(" local"),
    ]);
  });
});

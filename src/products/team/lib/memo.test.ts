import { describe, expect, it } from "vitest";
import { memoAsync } from "./memo";

describe("memoAsync", () => {
  it("asks once for the same key, also when asked at the same time", async () => {
    let calls = 0;
    const f = memoAsync((q: string) => q.toLowerCase(), async (q: string) => { calls += 1; return q.length; });
    const [a, b] = await Promise.all([f("Ann"), f("ann")]);
    expect([a, b, calls]).toEqual([3, 3, 1]);
    await f("Bob");
    expect(calls).toBe(2);
  });

  it("does not keep a failure", async () => {
    let calls = 0;
    const f = memoAsync((q: string) => q, async (q: string) => { calls += 1; if (calls === 1) throw new Error("down"); return q; });
    await expect(f("x")).rejects.toThrow("down");
    await expect(f("x")).resolves.toBe("x");
    expect(calls).toBe(2);
  });
});

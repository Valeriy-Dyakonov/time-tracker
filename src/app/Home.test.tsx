import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "./Home";

describe("Home", () => {
  it("draws a tile per tool and warns when Jira is missing", () => {
    const html = renderToString(<Home jiraReady={false} onOpen={() => {}} />);
    expect(html).toContain("t-worklog");
    expect(html).toContain("t-dashboard");
    expect(html).toContain("home-warn");
    expect(renderToString(<Home jiraReady onOpen={() => {}} />)).not.toContain("home-warn");
  });
});

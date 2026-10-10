import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionBriefDigest } from "./session-brief-digest";

describe("SessionBriefDigest", () => {
  it("renders digest content as escaped plain text", () => {
    const html = renderToStaticMarkup(createElement(SessionBriefDigest, { digest: {
      summary: "The founder is preparing a <script>alert(1)</script> product launch. The mentor can review its next steps.",
      key_questions: ["Which customer segment is first?", "What has been validated?", "What is the next milestone?"],
      suggested_focus: "Review the launch plan and agree on one measurable next step.",
    } }));
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Which customer segment is first?");
  });
});

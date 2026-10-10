import { createElement } from "react";
import type { SessionBriefDigest as SessionBriefDigestValue } from "@mentorloop/shared";

export function SessionBriefDigest({ digest }: { digest: SessionBriefDigestValue }) {
  return createElement("div", { className: "space-y-4" },
    createElement("section", null,
      createElement("h4", { className: "mb-1 text-sm font-semibold" }, "Summary"),
      createElement("p", { className: "whitespace-pre-wrap text-sm leading-6" }, digest.summary),
    ),
    createElement("section", null,
      createElement("h4", { className: "mb-1 text-sm font-semibold" }, "Key questions"),
      createElement("ul", { className: "list-inside list-disc space-y-1 text-sm leading-6" },
        ...digest.key_questions.map((question, index) => createElement("li", { key: `${index}-${question}` }, question)),
      ),
    ),
    createElement("section", null,
      createElement("h4", { className: "mb-1 text-sm font-semibold" }, "Suggested focus"),
      createElement("p", { className: "whitespace-pre-wrap text-sm leading-6" }, digest.suggested_focus),
    ),
  );
}

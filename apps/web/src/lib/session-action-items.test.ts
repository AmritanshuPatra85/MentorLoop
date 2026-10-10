import { describe, expect, it } from "vitest";
import { createManualSessionActionItem, removeSessionActionItemProposal, updateSessionActionItemProposal } from "./session-action-items";

const suggested = { title: "Send results", description: null, owner: "unassigned" as const, dueDate: null, priority: "medium" as const, sourceText: null };

describe("action item review helpers", () => {
  it("creates a blank manual item with safe neutral defaults", () => {
    expect(createManualSessionActionItem()).toEqual({ title: "", description: null, owner: "unassigned", dueDate: null, priority: "medium", sourceText: null });
  });

  it("allows title, description, owner, date and priority edits without losing the source excerpt", () => {
    const item = { ...suggested, sourceText: "I will send results by Friday." };
    expect(updateSessionActionItemProposal([item], 0, {
      title: "Review experiment results", description: "Include conversion rates.", owner: "founder", dueDate: "2026-10-16", priority: "high",
    })).toEqual([{ title: "Review experiment results", description: "Include conversion rates.", owner: "founder", dueDate: "2026-10-16", priority: "high", sourceText: item.sourceText }]);
  });

  it("removes unwanted suggestions and leaves the other items intact", () => {
    const second = { ...suggested, title: "Book a follow-up" };
    expect(removeSessionActionItemProposal([suggested, second], 0)).toEqual([second]);
  });
});

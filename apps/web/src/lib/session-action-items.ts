import type { SessionActionItemProposal } from "@mentorloop/shared";

export function createManualSessionActionItem(): SessionActionItemProposal {
  return { title: "", description: null, owner: "unassigned", dueDate: null, priority: "medium", sourceText: null };
}

export function updateSessionActionItemProposal(
  items: SessionActionItemProposal[],
  index: number,
  patch: Partial<SessionActionItemProposal>,
): SessionActionItemProposal[] {
  return items.map((item, position) => position === index ? { ...item, ...patch } : item);
}

export function removeSessionActionItemProposal(items: SessionActionItemProposal[], index: number): SessionActionItemProposal[] {
  return items.filter((_, position) => position !== index);
}

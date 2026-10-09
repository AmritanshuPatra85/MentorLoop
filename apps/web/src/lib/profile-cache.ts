export type CachedProfile = {
  role: "founder" | "mentor";
  avatarUrl: string | null;
  publicProfilePath?: string | null;
  profile: Record<string, unknown> | null;
};

export function mergeProfileOptimistically<T extends CachedProfile>(
  current: T,
  update: Record<string, unknown>,
): T {
  return { ...current, profile: { ...(current.profile ?? {}), ...update } };
}

/** Return the snapshot captured before an optimistic mutation. */
export function rollbackProfile<T>(previous: T | undefined): T | undefined {
  return previous;
}

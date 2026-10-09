import argon2 from "argon2";

// OWASP minimum profile for argon2id: 19 MiB memory, 2 iterations, 1 lane.
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

// Burns the same CPU as a real verification so that "unknown email" and
// "wrong password" take about the same time.
export async function verifyDummyPassword(plain: string): Promise<void> {
  dummyHash ??= argon2.hash("mentorloop-timing-equalizer", OPTIONS);
  await verifyPassword(await dummyHash, plain);
}
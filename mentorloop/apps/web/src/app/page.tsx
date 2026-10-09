import { pingResponseSchema } from "@mentorloop/shared";

export const dynamic = "force-dynamic";

async function getPing() {
  try {
    const base = process.env.API_URL ?? "http://localhost:4000";
    const res = await fetch(`${base}/ping`, { cache: "no-store" });
    const data = pingResponseSchema.parse(await res.json());
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export default async function Home() {
  const result = await getPing();
  return (
    <main>
      <h1>MentorLoop</h1>
      <p>Sprint 1.1 check: web {"->"} shared schema {"<-"} api</p>
      {result.ok ? (
        <pre>{JSON.stringify(result.data, null, 2)}</pre>
      ) : (
        <p style={{ color: "crimson" }}>API not reachable: {result.error}</p>
      )}
    </main>
  );
}
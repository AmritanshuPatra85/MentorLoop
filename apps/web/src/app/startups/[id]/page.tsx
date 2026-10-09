import { PublicStartupProfile } from "@/components/profiles/public-profile";

export default async function StartupProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground sm:px-6">
      <PublicStartupProfile id={id} />
    </main>
  );
}

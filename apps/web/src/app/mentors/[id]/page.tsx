import { PublicMentorProfile } from "@/components/profiles/public-profile";

export default async function MentorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground sm:px-6">
      <PublicMentorProfile id={id} />
    </main>
  );
}

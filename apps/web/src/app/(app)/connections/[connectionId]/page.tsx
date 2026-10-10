"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { ConnectionActionItems } from "@/components/sessions/connection-action-items";
import { ConnectionJourney } from "@/components/timeline/startup-timeline";

export default function ConnectionDetailPage() {
  const { connectionId } = useParams<{ connectionId: string }>();
  return <>
    <PageHeader title="Connection progress" description="Track shared commitments and see progress across your mentoring sessions." />
    <div className="space-y-5">
      <Link className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium" href={`/sessions?connectionId=${connectionId}`}>Schedule or view sessions</Link>
      <ConnectionActionItems connectionId={connectionId} />
      <ConnectionJourney connectionId={connectionId} />
    </div>
  </>;
}

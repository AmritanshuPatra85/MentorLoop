import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { ApiStatusCard } from "@/components/status/api-status-card";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Welcome to MentorLoop. Matches, sessions and progress will appear here."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <ApiStatusCard />
        <EmptyState
          icon={Inbox}
          title="Nothing here yet"
          description="Once profiles and matching are built, your recommended mentors and upcoming sessions will show up here."
        />
      </div>
    </>
  );
}
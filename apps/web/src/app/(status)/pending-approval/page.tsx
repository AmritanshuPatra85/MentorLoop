import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { StatusPageActions } from "@/components/common/status-page-actions";

export const metadata: Metadata = { title: "Pending Approval" };

export default function PendingApprovalPage() {
  return (
    <Card className="w-full text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-amber-500/15">
          <Clock className="size-7 text-amber-400" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Your application is under review</h1>
        <CardDescription className="mx-auto max-w-sm">
          Thank you for signing up as a mentor. Our team is reviewing your profile
          and you&apos;ll be notified once a decision is made.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StatusPageActions />
      </CardContent>
    </Card>
  );
}

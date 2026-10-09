import type { Metadata } from "next";
import { XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { StatusPageActions } from "@/components/common/status-page-actions";
import { RejectedApplicationDetails } from "@/components/status/rejected-application-details";

export const metadata: Metadata = { title: "Application Not Approved" };

export default function AccountRejectedPage() {
  return (
    <Card className="w-full text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-destructive/15">
          <XCircle className="size-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Application not approved</h1>
        <CardDescription className="mx-auto max-w-sm">
          Your mentor application was not approved. Review the reason below, update your
          profile, and submit it again for review.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RejectedApplicationDetails />
        <StatusPageActions />
      </CardContent>
    </Card>
  );
}

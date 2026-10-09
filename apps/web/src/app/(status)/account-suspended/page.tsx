import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { StatusPageActions } from "@/components/common/status-page-actions";

export const metadata: Metadata = { title: "Account Suspended" };

export default function AccountSuspendedPage() {
  return (
    <Card className="w-full text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-destructive/15">
          <ShieldX className="size-7 text-destructive" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Account suspended</h1>
        <CardDescription className="mx-auto max-w-sm">
          Your account has been suspended by an administrator.
          If you believe this is a mistake, please contact the E-Cell team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StatusPageActions />
      </CardContent>
    </Card>
  );
}

import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

export const metadata: Metadata = { title: "Verify Email" };

export default function VerifyEmailPage() {
  return (
    <Card className="w-full text-center">
      <CardHeader>
        <div className="mx-auto mb-2 flex size-14 items-center justify-center rounded-full bg-primary/15">
          <Mail className="size-7 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Verify your email</h1>
        <CardDescription className="mx-auto max-w-sm">
          Enter the 6-digit code we sent you to confirm your address and continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <VerifyEmailForm />
      </CardContent>
    </Card>
  );
}

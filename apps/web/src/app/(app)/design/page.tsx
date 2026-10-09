"use client";

import { CheckCircle2, Info, Inbox, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { pingResponseSchema } from "@mentorloop/shared";
import { EmptyState } from "@/components/common/empty-state";
import { ErrorState } from "@/components/common/error-state";
import { PageHeader } from "@/components/common/page-header";
import { CardSkeleton, ListSkeleton } from "@/components/common/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiClientError } from "@/lib/api-client";

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

const palette = [
  { name: "Midnight Ink", hex: "#17152E", note: "Brand, navigation", dark: true },
  { name: "Deep Aubergine", hex: "#24213D", note: "Dark cards", dark: true },
  { name: "Acid Lime", hex: "#C5F467", note: "Actions, key metrics", dark: false },
  { name: "Electric Lavender", hex: "#A99AFF", note: "AI and smart features", dark: false },
  { name: "Warm Ivory", hex: "#F6F3EC", note: "Light background", dark: false },
  { name: "Pure White", hex: "#FFFFFF", note: "Light cards", dark: false },
];

export default function DesignPage() {
  const [explode, setExplode] = useState(false);

  if (explode) throw new Error("Test render error from /design");

  async function triggerApiError() {
    try {
      await api.get("/nope", pingResponseSchema);
    } catch (e) {
      if (e instanceof ApiClientError) {
        toast.error(e.message, {
          description: e.requestId ? `Request ID: ${e.requestId}` : e.code,
        });
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Design system"
        description="Shared building blocks used across every screen. Also a quick way to test states."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Brand palette" className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {palette.map((p) => (
              <div key={p.hex} className="overflow-hidden rounded-lg border">
                <div
                  className="h-16"
                  style={{ backgroundColor: p.hex }}
                  aria-hidden="true"
                />
                <div className="p-2.5">
                  <p className="text-sm font-semibold leading-tight">{p.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{p.hex}</p>
                  <p className="mt-1 text-xs text-soft">{p.note}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Match card preview" description="Lime for the score, lavender for AI explanations, neutral for credentials.">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="grid size-12 shrink-0 place-items-center rounded-full bg-brand text-lg font-bold text-midnight">
                92
              </div>
              <div className="min-w-0">
                <p className="font-semibold">Aarav Mehta</p>
                <p className="text-sm text-muted-foreground">
                  Ex-product lead, fintech · 12 yrs experience
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline">Fintech</Badge>
                  <Badge variant="outline">MVP stage</Badge>
                  <Badge variant="success">
                    <CheckCircle2 /> Verified
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-md border border-ai/40 bg-ai/10 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-semibold text-ai-foreground">
                <Sparkles className="size-4" /> Why this match
              </p>
              <p className="text-soft">
                Aarav has taken two fintech products from MVP to first revenue, which lines up with
                your payments prototype and your goal of finding early customers.
              </p>
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm">Find your mentor</Button>
              <Button size="sm" variant="secondary">
                View profile
              </Button>
            </div>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">
              <Trash2 /> Destructive
            </Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">
              <Plus /> Large
            </Button>
          </div>
        </Section>

        <Section title="Status and AI badges" description="Every status has an icon or label, never colour alone.">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="ai">
              <Sparkles /> AI insight
            </Badge>
            <Badge variant="success">
              <CheckCircle2 /> Confirmed
            </Badge>
            <Badge variant="warning">
              <TriangleAlert /> Pending
            </Badge>
            <Badge variant="destructive">
              <TriangleAlert /> Failed
            </Badge>
            <Badge variant="info">
              <Info /> Update
            </Badge>
          </div>
        </Section>

        <Section title="Toasts and API errors" description="The API client turns error responses into typed errors.">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast.success("Saved successfully")}>
              Success toast
            </Button>
            <Button variant="outline" onClick={() => toast.error("Something failed")}>
              Error toast
            </Button>
            <Button variant="outline" onClick={() => void triggerApiError()}>
              Trigger API 404
            </Button>
          </div>
        </Section>

        <Section title="Error boundary" description="Crashes this page's render and shows the error boundary inside the shell.">
          <Button variant="destructive" onClick={() => setExplode(true)}>
            Crash this page
          </Button>
        </Section>

        <Section title="Loading skeletons">
          <CardSkeleton lines={2} />
          <ListSkeleton rows={2} />
        </Section>

        <Section title="Empty and error states">
          <EmptyState
            icon={Inbox}
            title="No messages yet"
            description="When you connect with a mentor, your conversation will appear here."
            action={<Button size="sm">Find a mentor</Button>}
          />
          <ErrorState message="We could not load this data." onRetry={() => toast("Retry clicked")} />
        </Section>
      </div>
    </>
  );
}
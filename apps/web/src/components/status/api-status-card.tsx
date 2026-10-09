"use client";

import { Activity, RefreshCw } from "lucide-react";
import { ErrorState } from "@/components/common/error-state";
import { CardSkeleton } from "@/components/common/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/hooks/use-health";
import { ApiClientError } from "@/lib/api-client";
import { formatDuration } from "@/lib/format";

const labels = { postgres: "PostgreSQL", redis: "Redis" } as const;

export function ApiStatusCard() {
  const { data, error, isLoading, isFetching, refetch } = useHealth();

  if (isLoading) return <CardSkeleton lines={3} />;

  if (error || !data) {
    return (
      <ErrorState
        title="API unreachable"
        message={error?.message ?? "Could not load system status."}
        detail={error instanceof ApiClientError && error.requestId ? `Request ID: ${error.requestId}` : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const healthy = data.status === "ok";

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-5 text-primary" /> System status
          </CardTitle>
          <CardDescription>Uptime {formatDuration(data.uptimeSeconds)}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={healthy ? "success" : "warning"}>{healthy ? "Healthy" : "Degraded"}</Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void refetch()}
            aria-label="Refresh status"
          >
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => {
          const check = data.checks[key];
          return (
            <div key={key} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span className="font-medium">{labels[key]}</span>
              <span className="flex items-center gap-3">
                <span className="text-muted-foreground">
                  {check.ok ? `${check.latencyMs} ms` : (check.error ?? "failed")}
                </span>
                <Badge variant={check.ok ? "success" : "destructive"}>{check.ok ? "OK" : "Down"}</Badge>
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
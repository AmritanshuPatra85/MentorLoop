"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/common/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      message="An unexpected error occurred on this page. You can try again."
      detail={error.digest ? `Reference: ${error.digest}` : undefined}
      onRetry={reset}
    />
  );
}
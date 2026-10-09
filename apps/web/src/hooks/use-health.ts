"use client";

import { useQuery } from "@tanstack/react-query";
import { healthResponseSchema } from "@mentorloop/shared";
import { api } from "@/lib/api-client";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) =>
      api.get("/health", healthResponseSchema, { signal, allowStatus: [503] }),
    refetchInterval: 15_000,
    retry: false,
  });
}
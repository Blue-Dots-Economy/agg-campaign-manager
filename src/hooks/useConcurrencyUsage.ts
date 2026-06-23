import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getConcurrencyUsage } from "@/lib/concurrency.functions";
import { useConcurrencyCap } from "@/lib/concurrency-cap";

export interface ConcurrencyUsage {
  cap: number;
  used: number;
  available: number;
  batches: {
    program: string;
    agentName: string;
    agentId: string;
    batchId: string;
    batchName: string;
    concurrency: number;
    status: string;
  }[];
  error?: string;
}

export function useConcurrencyUsage() {
  const cap = useConcurrencyCap();
  const fn = useServerFn(getConcurrencyUsage);
  return useQuery<ConcurrencyUsage>({
    queryKey: ["concurrency-usage", cap],
    queryFn: () => fn({ data: { cap } }) as Promise<ConcurrencyUsage>,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

export function useRefreshConcurrency() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["concurrency-usage"] });
}

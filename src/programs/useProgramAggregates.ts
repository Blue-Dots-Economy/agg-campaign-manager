import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchProgramAggregates,
  syncProgramSnapshot,
  type AggregatePayload,
} from "@/lib/snapshot.functions";
import type { ProgramConfig } from "./registry";
import { toast } from "sonner";

export function useProgramAggregates(config: ProgramConfig) {
  const fn = useServerFn(fetchProgramAggregates);
  const query = useQuery<AggregatePayload>({
    queryKey: ["program-aggregates", config.id],
    queryFn: () => fn({ data: { program: config.id } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
  return query;
}

export function useSyncProgram(programId: "kkb" | "dkb") {
  const qc = useQueryClient();
  const fn = useServerFn(syncProgramSnapshot);
  return useMutation({
    mutationFn: () => fn({ data: { program: programId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["program-aggregates", programId] });
      qc.invalidateQueries({ queryKey: ["campaign-day-rows", programId] });
      if (res.ok) toast.success(`Synced · ${res.rowCount} rows`);
      else if (res.errors.length > 0) toast.error(res.errors[0].message);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Sync failed"),
  });
}

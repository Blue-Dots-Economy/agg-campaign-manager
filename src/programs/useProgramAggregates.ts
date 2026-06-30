import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchProgramAggregates,
  syncProgramSnapshot,
  fetchKkbDropAnalysis,
  fetchCampaignList,
  type AggregatePayload,
  type KkbDropAnalysisPayload,
  type CampaignListItem,
} from "@/lib/snapshot.functions";
import type { ProgramConfig, ProgramId } from "./registry";
import { toast } from "sonner";

export interface OverviewFilters {
  state?: string;             // 'all' | 'GZB' | 'KA'
  dateFrom?: string | null;   // YYYY-MM-DD
  dateTo?: string | null;     // YYYY-MM-DD
  campaignType?: string;      // 'all' | 'normal' | 'higher_education'
  campaign?: string | null;   // exact campaign_type value (Campaign Review scope)
}

const STALE_AFTER_MS = 15 * 60_000; // 15 minutes — on-load freshness trigger

export function useProgramAggregates(config: ProgramConfig, filters?: OverviewFilters) {
  const fn = useServerFn(fetchProgramAggregates);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const campaignType = filters?.campaignType ?? "all";
  const campaign = filters?.campaign ?? null;
  const query = useQuery<AggregatePayload>({
    queryKey: ["program-aggregates", config.id, state, dateFrom, dateTo, campaignType, campaign],
    queryFn: () => fn({ data: { program: config.id, state, dateFrom, dateTo, campaignType, campaign } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    retry: 1,
    retryDelay: 1500,
  });
  return query;
}

export function useKkbDropAnalysis(filters?: OverviewFilters) {
  const fn = useServerFn(fetchKkbDropAnalysis);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const campaignType = filters?.campaignType ?? "all";
  const campaign = filters?.campaign ?? null;
  return useQuery<KkbDropAnalysisPayload>({
    queryKey: ["kkb-drop-analysis", state, dateFrom, dateTo, campaignType, campaign],
    queryFn: () => fn({ data: { state, dateFrom, dateTo, campaignType, campaign } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useCampaignList(
  config: ProgramConfig,
  filters?: Pick<OverviewFilters, "state" | "dateFrom" | "dateTo">,
) {
  const fn = useServerFn(fetchCampaignList);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  return useQuery<CampaignListItem[]>({
    queryKey: ["campaign-list", config.id, state, dateFrom, dateTo],
    queryFn: () => fn({ data: { program: config.id, state, dateFrom, dateTo } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useSyncProgram(programId: ProgramId) {
  const qc = useQueryClient();
  const fn = useServerFn(syncProgramSnapshot);
  return useMutation({
    mutationFn: (vars?: { force?: boolean; silent?: boolean }) =>
      fn({ data: { program: programId, force: vars?.force ?? false } }).then((r) => ({
        ...r,
        silent: vars?.silent ?? false,
      })),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["program-aggregates", programId] });
      qc.invalidateQueries({ queryKey: ["campaign-day-rows", programId] });
      if (res.silent) return;
      if (res.skipped) return; // a sync was already running — nothing to brag about
      if (res.ok) toast.success(`Synced · ${res.rowCount} rows`);
      else if (res.errors.length > 0) toast.error(res.errors[0].message);
    },
    onError: (e, vars) => {
      if (vars?.silent) return;
      toast.error(e instanceof Error ? e.message : "Sync failed");
    },
  });
}

/**
 * Auto-trigger a background sync when the visible snapshot is older than
 * STALE_AFTER_MS. Non-blocking — the current snapshot stays on screen and the
 * aggregates refetch when the sync finishes.
 */
export function useAutoFreshness(programId: ProgramId, lastSyncedAt: string | null | undefined) {
  const sync = useSyncProgram(programId);
  useEffect(() => {
    if (sync.isPending) return;
    const ageMs = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() : Infinity;
    if (ageMs > STALE_AFTER_MS) {
      sync.mutate({ silent: true });
    }
    // We intentionally only re-run when the program or the timestamp changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, lastSyncedAt]);
  return sync;
}

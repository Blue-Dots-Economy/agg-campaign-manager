import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { CallRow } from "@/programs/data";
import type { ProgramId } from "@/programs/registry";

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function asYesNoBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}
function asNum(v: string | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function asJsonArr(v: string | undefined): string[] {
  if (!v) return [];
  const s = String(v).trim();
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      /* ignore */
    }
  }
  return s.split(/[|,;]/).map((x) => x.trim()).filter(Boolean);
}
function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

// Defensive normalization: date cells may arrive as Excel serials ("46196"),
// ISO strings ("2026-06-23..."), or arbitrary display strings. Always store
// YYYY-MM-DD when we can recognize the shape; otherwise pass through.
function normalizeCampaignDate(v: string | undefined | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^[0-9]{4,6}$/.test(s)) {
    const serial = Number(s);
    // Excel epoch (with 1900 leap-year bug compat): 1899-12-30 + serial days.
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function mapRow(headers: string[], values: string[]): CallRow {
  const idx: Record<string, number> = {};
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (!(k in idx)) idx[k] = i;
    raw[k] = values[i] ?? "";
  });
  const get = (k: string) => {
    const i = idx[normKey(k)];
    return i !== undefined ? values[i] : undefined;
  };
  const callStatus = (get("call_status") ?? "").trim().toLowerCase();
  const answeredFromStatus = callStatus.startsWith("answered") || callStatus === "completed";
  return {
    campaign_day: get("campaign_day") ?? "",
    campaign_date: get("campaign_date") ?? "",
    campaign_type: get("campaign_type") ?? "",
    language: get("language") ?? "",
    call_id: get("call_id") ?? "",
    phone: get("phone") ?? get("contact_phone") ?? "",
    call_duration_seconds: asNum(get("call_duration_seconds")),
    call_datetime_ist: get("call_datetime_ist") ?? "",
    call_outcome: get("call_outcome") ?? "",
    call_answered:
      get("call_answered") !== undefined ? asYesNoBool(get("call_answered")) : answeredFromStatus,
    call_engaged: asYesNoBool(get("call_engaged")),
    applied_to_job: asYesNoBool(get("applied_to_job")),
    applications_count: asNum(get("applications_count")),
    jobs_shown: asYesNoBool(get("jobs_shown")),
    primary_topic: get("primary_topic") ?? "",
    call_language: get("call_language") ?? get("language") ?? "",
    call_recording_url: "",
    final_summary: "",
    call_transcript: "",
    tried_to_apply: asYesNoBool(get("tried_to_apply")),
    drop_reason: get("drop_reason") ?? "",
    city_campaign: get("city_campaign") ?? "",
    seeker_name: get("seeker_name") ?? get("candidate_name") ?? get("company_name") ?? "",
    user_intent: get("user_intent") ?? "low",
    jobs_recommended: asJsonArr(get("jobs_recommended")),
    jobs_applied: asJsonArr(get("jobs_applied")),
    jobs_failed_to_apply: asJsonArr(get("jobs_failed_to_apply")),
    "Intent Score": asNum(get("intent_score")),
    "Intent Score Reasoning": "",
    counselled: asYesNoBool(get("counselled")),
    interview_scheduled: asYesNoBool(get("interview_scheduled")),
    course_interest: get("course_interest") ?? undefined,
    trade: get("trade") ?? undefined,
    counsellor_id: get("counsellor_id") ?? undefined,
    candidate_name: get("candidate_name") ?? undefined,
    raw,
  };
}

export interface SyncResult {
  ok: boolean;
  program: ProgramId;
  rowCount: number;
  connectionCount: number;
  errors: { id: string; name: string; message: string }[];
  lastSyncedAt: string;
  skipped?: boolean;
}

// In-process lock as a fast-path guard. The DB status check below guards across
// processes / serverless invocations.
const inflight = new Map<ProgramId, Promise<SyncResult>>();

export async function performSync(program: ProgramId, opts?: { force?: boolean }): Promise<SyncResult> {
  const existing = inflight.get(program);
  if (existing && !opts?.force) return existing;
  const p = (async (): Promise<SyncResult> => {
    const client = sb();

    // Concurrent-run guard: if another sync started < 10 min ago and is still
    // marked "syncing", skip rather than stack.
    if (!opts?.force) {
      const { data: state } = await client
        .from("program_sync_state")
        .select("status, updated_at, last_synced_at, row_count")
        .eq("program", program)
        .maybeSingle();
      if (state && state.status === "syncing") {
        const startedAgoMs = Date.now() - new Date(state.updated_at as string).getTime();
        if (startedAgoMs < 15 * 60_000) {
          return {
            ok: true,
            program,
            rowCount: Number(state.row_count ?? 0),
            connectionCount: 0,
            errors: [],
            lastSyncedAt: (state.last_synced_at as string) ?? new Date().toISOString(),
            skipped: true,
          };
        }
        // Lock is stale — reset it so this run proceeds cleanly
        await client
          .from("program_sync_state")
          .update({ status: "ok", updated_at: new Date().toISOString() })
          .eq("program", program);
      }
    }


    const runStart = new Date().toISOString();
    await client
      .from("program_sync_state")
      .upsert({ program, status: "syncing", updated_at: runStart });

    const { data: conns } = await client
      .from("sheet_connections")
      .select("*")
      .eq("program", program)
      .eq("enabled", true);
    const list = (conns ?? []) as Array<{
      id: string;
      name: string;
      sheet_id: string;
      tab_name: string | null;
    }>;

    const errors: SyncResult["errors"] = [];
    const allRows: Array<{
      program: ProgramId;
      connection_id: string;
      call_id: string;
      campaign_day: string;
      intent_score: number | null;
      call_answered: boolean;
      call_engaged: boolean;
      applied_to_job: boolean;
      tried_to_apply: boolean;
      call_status: string;
      job_status: string;
      new_job_posted: string;
      talent_insights_shown: string;
      phases_reached: string;
      drop_reason: string;
      call_outcome: string;
      city_campaign: string;
      campaign_date: string;
      campaign_type: string;
      language: string;
      phone: string;
      call_duration_seconds: number | null;
      applications_count: number | null;
      data: CallRow;
      synced_at: string;
    }> = [];

    const BATCH = 2000;
    const PAGE = 10000;
    let completedRows = 0;
    let count: number | null = null;
    let lastSyncedAt = new Date().toISOString();

    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && list.length > 0) {
        const { readSheet } = await import("./sheets.server");
        const seen = new Set<string>();
        for (const c of list) {
          let pageStart = 2;
          let totalMappedForConn = 0;
          let effectiveTabForConn: string | null = null;
          try {
            while (true) {
              const { headers, rows, effectiveTab } = await readSheet(
                c.sheet_id,
                c.tab_name ?? undefined,
                pageStart,
                PAGE,
              );
              effectiveTabForConn = effectiveTab;
              if (rows.length === 0) break;

              const pageRows: typeof allRows = [];
              for (let i = 0; i < rows.length; i++) {
                const mapped = mapRow(headers, rows[i]);
                const callId = mapped.call_id?.trim() || `${c.id}:${pageStart - 2 + i}`;
                if (seen.has(callId)) continue;
                seen.add(callId);
                pageRows.push({
                  program,
                  connection_id: c.id,
                  call_id: callId,
                  campaign_day: mapped.campaign_day || "",
                  intent_score: Number.isFinite(mapped["Intent Score"]) ? mapped["Intent Score"] : null,
                  call_answered: mapped.call_answered,
                  call_engaged: mapped.call_engaged,
                  applied_to_job: mapped.applied_to_job,
                  tried_to_apply: mapped.tried_to_apply,
                  call_status: mapped.raw?.call_status ?? "",
                  job_status: mapped.raw?.job_status ?? "",
                  new_job_posted: mapped.raw?.new_job_posted ?? "",
                  talent_insights_shown: mapped.raw?.talent_insights_shown ?? "",
                  phases_reached: mapped.raw?.phases_reached ?? "",
                  drop_reason: mapped.drop_reason || mapped.raw?.drop_reason || "",
                  call_outcome: mapped.raw?.call_outcome || mapped.call_outcome || "",
                  city_campaign: mapped.raw?.city_campaign || mapped.city_campaign || "",
                  campaign_date: normalizeCampaignDate(mapped.campaign_date || mapped.raw?.campaign_date),
                  campaign_type: mapped.campaign_type || mapped.raw?.campaign_type || "",
                  language: mapped.language || mapped.raw?.language || "",
                  phone: mapped.phone || "",
                  call_duration_seconds: Number.isFinite(mapped.call_duration_seconds) ? mapped.call_duration_seconds : null,
                  applications_count: Number.isFinite(mapped.applications_count) ? mapped.applications_count : null,
                  data: mapped,
                  synced_at: new Date().toISOString(),
                });
              }

              let pageUpsertFailed = false;
              for (let i = 0; i < pageRows.length; i += BATCH) {
                const slice = pageRows.slice(i, i + BATCH);
                const { error } = await client
                  .from("call_rows")
                  .upsert(slice, { onConflict: "program,call_id" });
                if (error) {
                  errors.push({ id: "_upsert", name: "snapshot", message: error.message });
                  pageUpsertFailed = true;
                  break;
                }
                completedRows += slice.length;
              }
              if (pageUpsertFailed) break;

              // Heartbeat so the stale-lock guard sees fresh updated_at.
              await client
                .from("program_sync_state")
                .update({ updated_at: new Date().toISOString() })
                .eq("program", program);

              totalMappedForConn += rows.length;
              if (rows.length < PAGE) break;
              pageStart += PAGE;
            }

            const patch: Record<string, unknown> = {
              status: "connected",
              row_count: totalMappedForConn,
              last_error: null,
              last_synced_at: new Date().toISOString(),
            };
            if (effectiveTabForConn && effectiveTabForConn !== (c.tab_name ?? "")) {
              patch.tab_name = effectiveTabForConn;
            }
            await client.from("sheet_connections").update(patch).eq("id", c.id);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ id: c.id, name: c.name, message: msg });
            await client
              .from("sheet_connections")
              .update({
                status: "error",
                last_error: msg,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", c.id);
          }
          if (errors.some((e) => e.id === "_upsert")) break;
        }
      }

      // Reconcile deletions: rows that weren't touched in this run are no longer
      // in the sheet. Only do this when the run succeeded without upsert errors,
      // so a transient sheet failure can't wipe the snapshot.
      if (errors.length === 0 && completedRows > 0) {
        await client
          .from("call_rows")
          .delete()
          .eq("program", program)
          .lt("synced_at", runStart);
      }
    } finally {
      const { count: cnt } = await client
        .from("call_rows")
        .select("id", { head: true, count: "exact" })
        .eq("program", program);
      count = cnt ?? null;
      lastSyncedAt = new Date().toISOString();
      await client.from("program_sync_state").upsert({
        program,
        last_synced_at: lastSyncedAt,
        row_count: count ?? completedRows,
        status: errors.length > 0 ? "partial" : "ok",
        last_error: errors.length > 0 ? errors[0].message : null,
        updated_at: lastSyncedAt,
      });
    }


    return {
      ok: errors.length === 0,
      program,
      rowCount: count ?? completedRows,
      connectionCount: list.length,
      errors,
      lastSyncedAt,
    };

  })();
  inflight.set(program, p);
  try {
    return await p;
  } finally {
    inflight.delete(program);
  }
}

export const syncProgramSnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId; force?: boolean }) => d)
  .handler(async ({ data }) => performSync(data.program, { force: data.force }));

export interface CampaignRollup {
  day: string;
  date: string;
  type: string;
  language: string;
  rows: number;
  answered: number;
  engaged: number;
  converted: number;
  new_jobs: number;
  answered_pct: number;
  high_intent: number;
}

export interface ProgramAggregates {
  kpis: Record<string, number>;
  perDay: CampaignRollup[];
  drops: Array<{ reason: string; count: number }>;
  intents: Array<{ score: string; count: number }>;
  regions: Array<{ region: string; count: number }>;
  phases: Array<{ phase: string; count: number }>;
  jobStatus: Array<{ status: string; count: number }>;
  outcomes: Array<{ outcome: string; count: number }>;
  dkbIntents: Array<{ score: string; count: number }>;
  dropAnalysis: Array<{ stage: string; reason: string; gzb: number; ka: number; total: number }>;
}

function emptyAggregates(): ProgramAggregates {
  return {
    kpis: {},
    perDay: [],
    drops: [],
    intents: [],
    regions: [],
    phases: [],
    jobStatus: [],
    outcomes: [],
    dkbIntents: [],
    dropAnalysis: [],
  };
}

function normalizeAggregates(value: unknown): ProgramAggregates {
  if (!value || typeof value !== "object") return emptyAggregates();
  const raw = value as Partial<ProgramAggregates>;
  const kpis: Record<string, number> =
    raw.kpis && typeof raw.kpis === "object" ? { ...(raw.kpis as Record<string, number>) } : {};
  // RPC historically emits `total_rows`; frontend registry uses `total_calls`.
  // Mirror both so either consumer reads the same filtered count.
  if (kpis.total_calls == null && kpis.total_rows != null) kpis.total_calls = kpis.total_rows;
  if (kpis.total_rows == null && kpis.total_calls != null) kpis.total_rows = kpis.total_calls;
  return {
    kpis,
    perDay: Array.isArray(raw.perDay) ? raw.perDay : [],
    drops: Array.isArray(raw.drops) ? raw.drops : [],
    intents: Array.isArray(raw.intents) ? raw.intents : [],
    regions: Array.isArray(raw.regions) ? raw.regions : [],
    phases: Array.isArray(raw.phases) ? raw.phases : [],
    jobStatus: Array.isArray(raw.jobStatus) ? raw.jobStatus : [],
    outcomes: Array.isArray(raw.outcomes) ? raw.outcomes : [],
    dkbIntents: Array.isArray(raw.dkbIntents) ? raw.dkbIntents : [],
    dropAnalysis: Array.isArray(raw.dropAnalysis) ? raw.dropAnalysis : [],
  };
}

export type MetricAccent = "green" | "amber" | "red" | "blue";

export interface MetricCardDef {
  key: string;
  label: string;
  value: string;
  sub: string;
  accent: MetricAccent;
}

export interface MetricGroup {
  key: string;
  title: string;
  subtitle?: string;
  cards: MetricCardDef[];
}

export interface ProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
}
export interface ProgramMetricsRaw {
  program?: string;
  providerFunnel?: ProviderFunnelStage[];
  [k: string]: number | string | ProviderFunnelStage[] | undefined;
}

export interface AggregatePayload {
  source: "snapshot" | "empty";
  hasSnapshot: boolean;
  totalRows: number;
  /** Total rows in the unfiltered snapshot (for distinguishing "no snapshot" vs "filter excludes everything"). */
  snapshotRowCount: number;
  connectionCount: number;
  lastSyncedAt: string | null;
  syncStatus: string;
  aggregates: ProgramAggregates;
  metricGroups: MetricGroup[];
  metrics: ProgramMetricsRaw;
  /** Lightweight per-day index for the Campaigns table (no row payload). */
  campaigns: ProgramAggregates["perDay"];
  /** Why a payload is empty — UI uses this to pick the right empty-state copy. */
  emptyReason?: "no_connections" | "no_snapshot" | "no_results";
  error?: string;
}

function emptyPayload(
  connectionCount: number,
  state: { last_synced_at: string | null; status: string } | null,
  error?: string,
  emptyReason: AggregatePayload["emptyReason"] = connectionCount === 0 ? "no_connections" : "no_snapshot",
): AggregatePayload {
  return {
    source: "empty",
    hasSnapshot: false,
    totalRows: 0,
    snapshotRowCount: 0,
    connectionCount,
    lastSyncedAt: state?.last_synced_at ?? null,
    syncStatus: state?.status ?? "idle",
    aggregates: emptyAggregates(),
    metricGroups: [],
    metrics: {},
    campaigns: [],
    emptyReason,
    error,
  };
}

interface AggregateRpcPayload {
  connectionCount?: number;
  lastSyncedAt?: string | null;
  syncStatus?: string;
  stateRowCount?: number;
  aggregates?: unknown;
  metricGroups?: unknown;
  metrics?: unknown;
}

function normalizeMetricsRaw(value: unknown): ProgramMetricsRaw {
  if (!value || typeof value !== "object") return {};
  const out: ProgramMetricsRaw = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "program") out.program = String(v);
    else if (k === "providerFunnel" && Array.isArray(v)) {
      out.providerFunnel = v.flatMap((it) => {
        if (!it || typeof it !== "object") return [];
        const o = it as Record<string, unknown>;
        return [{
          key: String(o.key ?? ""),
          label: String(o.label ?? ""),
          providers: Number(o.providers ?? 0) || 0,
          openings: Number(o.openings ?? 0) || 0,
        }];
      });
    }
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v !== "" && !isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}


function normalizeMetricGroups(value: unknown): MetricGroup[] {
  if (!Array.isArray(value)) return [];
  const allowed: MetricAccent[] = ["green", "amber", "red", "blue"];
  return value.flatMap((g): MetricGroup[] => {
    if (!g || typeof g !== "object") return [];
    const o = g as Record<string, unknown>;
    const cards = Array.isArray(o.cards)
      ? o.cards.flatMap((c): MetricCardDef[] => {
          if (!c || typeof c !== "object") return [];
          const x = c as Record<string, unknown>;
          const accent = allowed.includes(x.accent as MetricAccent) ? (x.accent as MetricAccent) : "blue";
          return [{
            key: String(x.key ?? ""),
            label: String(x.label ?? ""),
            value: String(x.value ?? ""),
            sub: String(x.sub ?? ""),
            accent,
          }];
        })
      : [];
    return [{
      key: String(o.key ?? ""),
      title: String(o.title ?? ""),
      subtitle: o.subtitle ? String(o.subtitle) : undefined,
      cards,
    }];
  });
}

export const fetchProgramAggregates = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId; state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string }) => d)
  .handler(async ({ data }): Promise<AggregatePayload> => {
    const program = data.program;
    const state = data.state && data.state !== "all" ? data.state : "all";
    const dateFrom = data.dateFrom ?? null;
    const dateTo = data.dateTo ?? null;
    const campaignType = data.campaignType ?? "all";
    try {
      let payload: AggregateRpcPayload;
      try {
        const client = sb();
        const { data: rpcData, error } = await client.rpc("get_program_aggregate_payload", {
          _program: program,
          _state: state,
          _date_from: dateFrom,
          _date_to: dateTo,
          _campaign_type: campaignType,
        });
        if (error) throw new Error(error.message);
        payload = (rpcData && typeof rpcData === "object" ? rpcData : {}) as AggregateRpcPayload;
      } catch (e) {
        return emptyPayload(0, null, e instanceof Error ? e.message : String(e));
      }
      const connectionCount = payload.connectionCount ?? 0;
      const snapshotRowCount = Number(payload.stateRowCount ?? 0);
      const stateMeta = {
        last_synced_at: payload.lastSyncedAt ?? null,
        status: payload.syncStatus ?? "idle",
      };
      if (!snapshotRowCount) {
        return emptyPayload(
          connectionCount,
          stateMeta,
          undefined,
          connectionCount === 0 ? "no_connections" : "no_snapshot",
        );
      }
      const aggregates = normalizeAggregates(payload.aggregates);
      const metricGroups = normalizeMetricGroups(payload.metricGroups);
      const metrics = normalizeMetricsRaw(payload.metrics);
      // Filtered count — use the reconciled KPI (mirrors total_rows/total_calls).
      // Do NOT fall back to the unfiltered snapshot size; that masks filter results.
      const totalRows = Number(aggregates.kpis.total_calls ?? 0);
      return {
        source: "snapshot",
        hasSnapshot: true,
        totalRows,
        snapshotRowCount,
        connectionCount,
        lastSyncedAt: stateMeta.last_synced_at,
        syncStatus: stateMeta.status,
        aggregates,
        metricGroups,
        metrics,
        campaigns: aggregates.perDay,
        emptyReason: totalRows === 0 ? "no_results" : undefined,
      };
    } catch (e) {
      return emptyPayload(0, null, e instanceof Error ? e.message : String(e));
    }
  });


export const fetchCampaignDayRowsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId; day: string }) => d)
  .handler(async ({ data }): Promise<{ rows: CallRow[] }> => {
    const client = sb();
    const { data: out, error } = await client
      .from("call_rows")
      .select("data")
      .eq("program", data.program)
      .eq("campaign_day", data.day)
      .limit(5000);
    if (error) throw new Error(error.message);
    return { rows: (out ?? []).map((r: { data: CallRow }) => r.data) };
  });

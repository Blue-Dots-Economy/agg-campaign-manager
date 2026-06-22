import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { CallRow } from "@/programs/data";
import type { ProgramId, ProgramConfig } from "@/programs/registry";
import { registry as PROGRAMS } from "@/programs/registry";
import {
  computeKpis,
  byCampaignDay,
  dropReasonBreakdown,
  intentDistribution,
  regionSplit,
  phasesReachedBreakdown,
  jobStatusBreakdown,
  callOutcomeBreakdown,
  intentDistributionDkb,
} from "@/programs/metrics";

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

interface SyncResult {
  ok: boolean;
  program: ProgramId;
  rowCount: number;
  connectionCount: number;
  errors: { id: string; name: string; message: string }[];
  lastSyncedAt: string;
}

async function performSync(program: ProgramId): Promise<SyncResult> {
  const client = sb();
  await client
    .from("program_sync_state")
    .upsert({ program, status: "syncing", updated_at: new Date().toISOString() });

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
    data: CallRow;
  }> = [];

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && list.length > 0) {
    const { readSheet } = await import("./sheets.server");
    const seen = new Set<string>();
    for (const c of list) {
      try {
        const { headers, rows, effectiveTab } = await readSheet(c.sheet_id, c.tab_name ?? undefined);
        for (let i = 0; i < rows.length; i++) {
          const mapped = mapRow(headers, rows[i]);
          const key = mapped.call_id || `${c.id}:${i}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allRows.push({
            program,
            connection_id: c.id,
            call_id: mapped.call_id || "",
            campaign_day: mapped.campaign_day || "",
            intent_score: Number.isFinite(mapped["Intent Score"]) ? mapped["Intent Score"] : null,
            data: mapped,
          });
        }
        const patch: Record<string, unknown> = {
          status: "connected",
          row_count: rows.length,
          last_error: null,
          last_synced_at: new Date().toISOString(),
        };
        if (effectiveTab && effectiveTab !== (c.tab_name ?? "")) patch.tab_name = effectiveTab;
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
    }
  }

  // Replace snapshot for this program.
  await client.from("call_rows").delete().eq("program", program);
  const BATCH = 500;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const slice = allRows.slice(i, i + BATCH);
    const { error } = await client.from("call_rows").insert(slice);
    if (error) {
      errors.push({ id: "_insert", name: "snapshot", message: error.message });
      break;
    }
  }

  const lastSyncedAt = new Date().toISOString();
  await client.from("program_sync_state").upsert({
    program,
    last_synced_at: lastSyncedAt,
    row_count: allRows.length,
    status: errors.length > 0 ? "partial" : "ok",
    last_error: errors.length > 0 ? errors[0].message : null,
    updated_at: lastSyncedAt,
  });

  return {
    ok: errors.length === 0,
    program,
    rowCount: allRows.length,
    connectionCount: list.length,
    errors,
    lastSyncedAt,
  };
}

export const syncProgramSnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }) => performSync(data.program));

async function loadRows(program: ProgramId): Promise<CallRow[]> {
  const client = sb();
  const out: CallRow[] = [];
  const PAGE = 1000;
  let from = 0;
  // paginate to bypass PostgREST 1000-row default cap
  // (KKB has ~22k rows)
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await client
      .from("call_rows")
      .select("data")
      .eq("program", program)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Array<{ data: CallRow }>;
    for (const r of batch) out.push(r.data);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function countConnections(program: ProgramId): Promise<number> {
  const client = sb();
  const { count } = await client
    .from("sheet_connections")
    .select("id", { count: "exact", head: true })
    .eq("program", program)
    .eq("enabled", true);
  return count ?? 0;
}

async function getSyncState(program: ProgramId) {
  const client = sb();
  const { data } = await client
    .from("program_sync_state")
    .select("*")
    .eq("program", program)
    .maybeSingle();
  return data as {
    program: string;
    last_synced_at: string | null;
    row_count: number;
    status: string;
    last_error: string | null;
  } | null;
}

function buildAggregates(config: ProgramConfig, rows: CallRow[]) {
  const isDkb = config.id === "dkb";
  return {
    kpis: computeKpis(config, rows),
    perDay: byCampaignDay(config, rows),
    drops: isDkb ? [] : dropReasonBreakdown(config, rows),
    intents: isDkb ? [] : intentDistribution(rows),
    regions: isDkb ? [] : regionSplit(rows),
    phases: isDkb ? phasesReachedBreakdown(rows) : [],
    jobStatus: isDkb ? jobStatusBreakdown(rows) : [],
    outcomes: isDkb ? callOutcomeBreakdown(rows) : [],
    dkbIntents: isDkb ? intentDistributionDkb(rows) : [],
  };
}

export type ProgramAggregates = ReturnType<typeof buildAggregates>;

export interface AggregatePayload {
  source: "snapshot" | "empty";
  hasSnapshot: boolean;
  totalRows: number;
  connectionCount: number;
  lastSyncedAt: string | null;
  syncStatus: string;
  aggregates: ProgramAggregates;
  /** Lightweight per-day index for the Campaigns table (no row payload). */
  campaigns: ProgramAggregates["perDay"];
  error?: string;
}

function emptyPayload(
  config: ProgramConfig,
  connectionCount: number,
  state: { last_synced_at: string | null; status: string } | null,
  error?: string,
): AggregatePayload {
  return {
    source: "empty",
    hasSnapshot: false,
    totalRows: 0,
    connectionCount,
    lastSyncedAt: state?.last_synced_at ?? null,
    syncStatus: state?.status ?? "idle",
    aggregates: buildAggregates(config, []),
    campaigns: [],
    error,
  };
}

export const fetchProgramAggregates = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }): Promise<AggregatePayload> => {
    const program = data.program;
    const config = PROGRAMS[program];
    try {
      let state: Awaited<ReturnType<typeof getSyncState>> = null;
      let connectionCount = 0;
      try {
        [state, connectionCount] = await Promise.all([
          getSyncState(program),
          countConnections(program),
        ]);
      } catch (e) {
        return emptyPayload(config, 0, null, e instanceof Error ? e.message : String(e));
      }

      if (!state || state.row_count === 0) {
        // Never sync inline — Refresh button triggers syncProgramSnapshot explicitly.
        return emptyPayload(config, connectionCount, state);
      }

      let rows: CallRow[] = [];
      try {
        rows = await loadRows(program);
      } catch (e) {
        return emptyPayload(config, connectionCount, state, e instanceof Error ? e.message : String(e));
      }
      const aggregates = buildAggregates(config, rows);
      return {
        source: "snapshot",
        hasSnapshot: true,
        totalRows: rows.length,
        connectionCount,
        lastSyncedAt: state.last_synced_at,
        syncStatus: state.status,
        aggregates,
        campaigns: aggregates.perDay,
      };
    } catch (e) {
      return emptyPayload(config, 0, null, e instanceof Error ? e.message : String(e));
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

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { CallRow } from "@/programs/data";
import { getCampaignData } from "@/programs/data";
import { registry, type ProgramId } from "@/programs/registry";

export interface SheetConnection {
  id: string;
  program: ProgramId;
  name: string;
  sheet_id: string;
  tab_name: string | null;
  enabled: boolean;
  status: string;
  row_count: number | null;
  last_synced_at: string | null;
  created_at: string;
}

function getServerSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export const listConnections = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }) => {
    const sb = getServerSupabase();
    const { data: rows, error } = await sb
      .from("sheet_connections")
      .select("*")
      .eq("program", data.program)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as SheetConnection[];
  });

export const createConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId; name: string; sheet_id: string; tab_name?: string }) => d)
  .handler(async ({ data }) => {
    const sb = getServerSupabase();
    const { data: row, error } = await sb
      .from("sheet_connections")
      .insert({
        program: data.program,
        name: data.name,
        sheet_id: data.sheet_id,
        tab_name: data.tab_name || null,
        enabled: true,
        status: "unknown",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as SheetConnection;
  });

export const updateConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; enabled?: boolean; name?: string; tab_name?: string | null }) => d)
  .handler(async ({ data }) => {
    const sb = getServerSupabase();
    const patch: Record<string, unknown> = {};
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    if (data.name !== undefined) patch.name = data.name;
    if (data.tab_name !== undefined) patch.tab_name = data.tab_name;
    const { data: row, error } = await sb
      .from("sheet_connections")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as SheetConnection;
  });

export const deleteConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const sb = getServerSupabase();
    const { error } = await sb.from("sheet_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testConnection = createServerFn({ method: "POST" })
  .inputValidator((d: { id?: string; sheet_id: string; tab_name?: string }) => d)
  .handler(async ({ data }) => {
    const { readSheet } = await import("./sheets.server");
    try {
      const result = await readSheet(data.sheet_id, data.tab_name);
      if (data.id) {
        const sb = getServerSupabase();
        await sb
          .from("sheet_connections")
          .update({
            status: "connected",
            row_count: result.rowCount,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", data.id);
      }
      return { ok: true as const, rowCount: result.rowCount, headers: result.headers };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (data.id) {
        const sb = getServerSupabase();
        await sb
          .from("sheet_connections")
          .update({ status: "error", last_synced_at: new Date().toISOString() })
          .eq("id", data.id);
      }
      return { ok: false as const, error: msg };
    }
  });

// ---- Aggregation -----------------------------------------------------------

function asBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
}
function asNum(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function asArr(v: string | undefined): string[] {
  if (!v) return [];
  return v.split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
}

function mapRow(headers: string[], values: string[]): CallRow {
  const idx: Record<string, number> = {};
  headers.forEach((h, i) => (idx[h] = i));
  const get = (k: string) => (idx[k] !== undefined ? values[idx[k]] : undefined);
  return {
    campaign_day: get("campaign_day") ?? "",
    campaign_date: get("campaign_date") ?? "",
    campaign_type: get("campaign_type") ?? "",
    language: get("language") ?? "",
    call_id: get("call_id") ?? "",
    phone: get("phone") ?? "",
    call_duration_seconds: asNum(get("call_duration_seconds")),
    call_datetime_ist: get("call_datetime_ist") ?? "",
    call_outcome: get("call_outcome") ?? "",
    call_answered: asBool(get("call_answered")),
    call_engaged: asBool(get("call_engaged")),
    applied_to_job: asBool(get("applied_to_job")),
    applications_count: asNum(get("applications_count")),
    jobs_shown: asNum(get("jobs_shown")),
    primary_topic: get("primary_topic") ?? "",
    call_language: get("call_language") ?? get("language") ?? "",
    call_recording_url: get("call_recording_url") ?? "",
    final_summary: get("final_summary") ?? "",
    call_transcript: get("call_transcript") ?? "",
    tried_to_apply: asBool(get("tried_to_apply")),
    drop_reason: get("drop_reason") ?? "",
    city_campaign: get("city_campaign") ?? "",
    seeker_name: get("seeker_name") ?? get("candidate_name") ?? "",
    user_intent: get("user_intent") ?? "low",
    jobs_recommended: asArr(get("jobs_recommended")),
    jobs_applied: asArr(get("jobs_applied")),
    jobs_failed_to_apply: asArr(get("jobs_failed_to_apply")),
    "Intent Score": asNum(get("Intent Score")),
    "Intent Score Reasoning": get("Intent Score Reasoning") ?? "",
    counselled: asBool(get("counselled")),
    interview_scheduled: asBool(get("interview_scheduled")),
    course_interest: get("course_interest") ?? undefined,
    trade: get("trade") ?? undefined,
    counsellor_id: get("counsellor_id") ?? undefined,
    candidate_name: get("candidate_name") ?? undefined,
  };
}

export const fetchProgramRows = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }) => {
    const sb = getServerSupabase();
    const { data: conns, error } = await sb
      .from("sheet_connections")
      .select("*")
      .eq("program", data.program)
      .eq("enabled", true);
    if (error) throw new Error(error.message);
    const list = (conns ?? []) as SheetConnection[];

    // No service account or no enabled connections → fall back to mock so the
    // dashboard still has content to render.
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || list.length === 0) {
      return {
        source: "mock" as const,
        connectionCount: list.length,
        rows: getCampaignData(registry[data.program]),
      };
    }

    const { readSheet } = await import("./sheets.server");
    const merged = new Map<string, CallRow>();
    const errors: { id: string; name: string; message: string }[] = [];
    for (const c of list) {
      try {
        const { headers, rows } = await readSheet(c.sheet_id, c.tab_name ?? undefined);
        for (const r of rows) {
          const mapped = mapRow(headers, r);
          const key = mapped.call_id || `${c.id}:${merged.size}`;
          if (!merged.has(key)) merged.set(key, mapped);
        }
        await sb
          .from("sheet_connections")
          .update({
            status: "connected",
            row_count: rows.length,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", c.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({ id: c.id, name: c.name, message: msg });
        await sb
          .from("sheet_connections")
          .update({ status: "error", last_synced_at: new Date().toISOString() })
          .eq("id", c.id);
      }
    }

    const rows = Array.from(merged.values());
    if (rows.length === 0) {
      return {
        source: "mock" as const,
        connectionCount: list.length,
        rows: getCampaignData(registry[data.program]),
        errors,
      };
    }
    return { source: "sheets" as const, connectionCount: list.length, rows, errors };
  });

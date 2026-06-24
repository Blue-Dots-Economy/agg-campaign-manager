// Raya → staging-sheet export. NEVER writes to a sheet_id present in
// sheet_connections (the masters). All writeback goes to a separate staging
// sheet configured in program_export_targets.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { delay, rayaFetch } from "./raya-api";
import {
  appendStagingRows,
  deleteSheetTab,
  readStagingCallIds,
  writeStagingHeaders,
} from "./sheets.server";
import { registry, type ProgramId } from "@/programs/registry";

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface ExportTarget {
  program: ProgramId;
  sheet_id: string;
  tab_name: string | null;
  label: string | null;
  enabled: boolean;
  last_exported_at: string | null;
  last_error: string | null;
}

// ---------- read sheet id from URL ----------
function parseSheetId(input: string): string {
  const t = input.trim();
  if (!t) return "";
  const m = t.match(/\/d\/([A-Za-z0-9-_]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9-_]{20,}$/.test(t)) return t;
  return "";
}

// ---------- target read ----------
export const getExportTarget = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    const c = sb();
    const { data: row } = await c
      .from("program_export_targets")
      .select("*")
      .eq("program", data.program)
      .maybeSingle();
    return (row ?? null) as ExportTarget | null;
  });

// ---------- target write ----------
export const setExportTarget = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { program: ProgramId; sheetUrlOrId: string; tabName?: string; label?: string }) => {
      if (!d.program) throw new Error("program required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const sheetId = parseSheetId(data.sheetUrlOrId);
    if (!sheetId) throw new Error("Provide a valid Google Sheet URL or ID.");

    const c = sb();
    const { data: masters, error: e1 } = await c
      .from("sheet_connections")
      .select("sheet_id,name,program");
    if (e1) throw new Error(e1.message);
    const clash = (masters ?? []).find((m) => String(m.sheet_id).trim() === sheetId);
    if (clash) {
      throw new Error(
        `Refusing to use sheet ${sheetId} — it is configured as a master sheet (${clash.name ?? clash.program}) in Connections. Staging must be a separate sheet.`,
      );
    }

    const payload = {
      program: data.program,
      sheet_id: sheetId,
      tab_name: data.tabName?.trim() || null,
      label: data.label?.trim() || null,
      enabled: true,
      last_error: null,
    };
    const { data: row, error } = await c
      .from("program_export_targets")
      .upsert(payload, { onConflict: "program" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as ExportTarget;
  });

// ---------- helpers ----------
function normalize(k: string): string {
  return String(k ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function asStr(v: any): string {
  if (v == null) return "";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
}

function asArr(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

function nonEmpty(v: any): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return String(v).trim().length > 0;
}

function stripIst(s: string): string {
  return String(s ?? "").replace(/\s*IST\s*$/i, "").trim();
}

function datePart(s: string): string {
  const t = stripIst(s);
  if (!t) return "";
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

function pickLastCall(contact: any): any | null {
  const arr = contact?.calls ?? contact?.executions ?? contact?.call_history ?? null;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => {
    const ta =
      Date.parse(stripIst(a?.call_start_time_ist ?? a?.created_at ?? a?.updated_at ?? a?.call_time ?? "")) || 0;
    const tb =
      Date.parse(stripIst(b?.call_start_time_ist ?? b?.created_at ?? b?.updated_at ?? b?.call_time ?? "")) || 0;
    return tb - ta;
  });
  return sorted[0] ?? null;
}

// ---------- region detection ----------
type Region = { region: string; language: string; city: string };

function detectRegionFromText(s: string): Region | null {
  const t = (s || "").toLowerCase();
  if (/(^|[^a-z])ka([^a-z]|$)|kannada|hubli|dharwad|karnataka/.test(t))
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  if (/(^|[^a-z])gzb([^a-z]|$)|hindi|ghaziabad|uttar.?pradesh/.test(t))
    return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
  return null;
}

function detectRegionForContact(
  contact: any,
  fallbacks: { batchName?: string; agentName?: string; program?: string },
): Region {
  const args = contact?.agent_args ?? contact?.metadata ?? contact?.args ?? {};
  const explicit =
    args?._region ?? args?.region ?? contact?.region ?? contact?._region ?? "";
  const fromExplicit = detectRegionFromText(String(explicit));
  if (fromExplicit) return fromExplicit;
  const cityHint = args?.city_campaign ?? args?.city ?? contact?.city_campaign ?? "";
  const fromCity = detectRegionFromText(String(cityHint));
  if (fromCity) return fromCity;
  for (const txt of [fallbacks.batchName, fallbacks.agentName, fallbacks.program]) {
    const r = detectRegionFromText(String(txt ?? ""));
    if (r) return r;
  }
  return { region: "", language: "", city: "" };
}

// ---------- format helpers (master-sheet-exact) ----------
function fmtPhone(v: any): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

function fmtInt(v: any): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return String(Math.trunc(n));
}

function fmtDateTimeIst(v: any): string {
  // "YYYY-MM-DD HH:MM:SS" — Raya gives "YYYY-MM-DD HH:MM:SS IST" or ISO; strip IST + ms.
  const raw = stripIst(String(v ?? "")).replace(/T/, " ");
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ T]?(\d{2}:\d{2}:\d{2})?/);
  if (m) return m[2] ? `${m[1]} ${m[2]}` : m[1];
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// Raya's per-call outcome string is the source of truth — pass through, only
// normalize obvious aliases. Falls back to derived bucket if Raya omitted it.
function rayaOutcomeOrDerive(
  rayaOutcome: string,
  fallback: { contactStatus: string; durationSec: number; applied: boolean; jobsShown: boolean; engaged: boolean },
): string {
  const t = String(rayaOutcome ?? "").trim();
  if (t) return t;
  const s = normalize(fallback.contactStatus);
  if (s === "pending") return "Pending";
  if (fallback.durationSec <= 0) return "No Answer";
  if (fallback.applied || fallback.jobsShown || fallback.engaged) return "Completed";
  return "Early Disconnect";
}

function computeIntent(opts: {
  durationSec: number;
  applied: boolean;
  triedToApply: boolean;
  jobsShown: boolean;
  userIntent: string;
}): { score: number; reasoning: string } {
  const d = opts.durationSec;
  let dur = 0;
  if (d >= 180) dur = 4;
  else if (d >= 120) dur = 3;
  else if (d >= 60) dur = 2;
  else if (d >= 30) dur = 1;
  let app = 0;
  if (opts.applied) app = 4;
  else if (opts.triedToApply) app = 2;
  let eng = 0;
  if (opts.jobsShown) eng += 1;
  if (nonEmpty(opts.userIntent)) eng += 1;
  const score = dur + app + eng;
  // Master format: "Duration {s}s (+{d}) | Application (+{a}) | Engagement (+{e}) → {total}/10"
  const reasoning =
    `Duration ${d}s (+${dur}) | Application (+${app}) | Engagement (+${eng}) → ${score}/10`;
  return { score, reasoning };
}

// ---------- per-contact row builder ----------
interface LaunchMeta {
  campaignDay?: string | null;
  campaignDate?: string | null;
  campaignType?: string | null;
  language?: string | null;
  cityCampaign?: string | null;
  region?: string | null;
  batchName?: string | null;
  agentName?: string | null;
}
interface BuildCtx {
  columns: string[];
  program: ProgramId;
  batchName: string;
  agentName: string;
  launchMeta: LaunchMeta;
}

function buildRow(contact: any, lastCall: any, ctx: BuildCtx): string[] | null {
  // Skip contacts with no completed call (no call recordings/duration).
  // lastCall presence is required.
  if (!lastCall) return null;

  const lm = ctx.launchMeta;
  const region = lm.region || lm.language
    ? {
        region: String(lm.region ?? ""),
        language: String(lm.language ?? ""),
        city: String(lm.cityCampaign ?? ""),
      }
    : detectRegionForContact(contact, {
        batchName: ctx.batchName,
        agentName: ctx.agentName,
        program: ctx.program,
      });

  // call-level extraction
  const callId = asStr(lastCall?.uuid ?? lastCall?.id ?? lastCall?.execution_id ?? "");
  const callDur = Number(
    lastCall?.call_duration ?? lastCall?.duration ?? lastCall?.duration_seconds ?? 0,
  );
  const callDateIst = stripIst(asStr(lastCall?.call_start_time_ist ?? lastCall?.call_time ?? ""));
  const callRecording = asStr(lastCall?.call_recording_url ?? lastCall?.recording_url ?? "");
  const callTranscript = asStr(lastCall?.call_transcript ?? lastCall?.transcript ?? "");
  const finalSummary = asStr(
    lastCall?.final_summary ?? lastCall?.summary ?? contact?.final_summary ?? "",
  );
  const dropReason = asStr(
    lastCall?.drop_reason ?? contact?.drop_reason ?? "",
  );

  if (!callId) return null;

  // contact-level domain fields (search both lastCall.agent_args and contact)
  const ca = lastCall?.agent_args ?? lastCall?.args ?? {};
  const get = (k: string) =>
    ca?.[k] ?? contact?.[k] ?? contact?.agent_args?.[k] ?? "";

  const jobsApplied = asArr(get("jobs_applied"));
  const jobsFailed = asArr(get("jobs_failed_to_apply"));
  const jobsRecommended = asArr(get("jobs_recommended"));
  const jobsShownRaw = get("jobs_shown");
  const jobsShown =
    (Array.isArray(jobsShownRaw) ? jobsShownRaw.length > 0 : String(jobsShownRaw).toLowerCase() === "true" || asArr(jobsShownRaw).length > 0);
  const applied = jobsApplied.length > 0;
  const triedToApply = applied || jobsFailed.length > 0;
  const engaged = nonEmpty(get("primary_topic")) || nonEmpty(get("user_intent"));
  // seeker_name + user_intent are intentionally left blank to match master.
  const _seekerName = asStr(get("seeker_name") || contact?.contact_name); // captured but not exported
  void _seekerName;
  const userIntentRaw = asStr(get("user_intent"));
  void userIntentRaw;
  const phoneRaw = asStr(contact?.contact_phone ?? contact?.phone ?? get("phone"));
  const phone = fmtPhone(phoneRaw);
  const primaryTopic = asStr(get("primary_topic"));
  const contactStatus = asStr(contact?.status ?? contact?.contact_status ?? "");

  // Pass through Raya's own outcome string; only derive if Raya didn't send one.
  const rayaOutcome = asStr(
    lastCall?.call_outcome ?? lastCall?.outcome ?? contact?.call_outcome ?? "",
  );
  const outcome = rayaOutcomeOrDerive(rayaOutcome, {
    contactStatus,
    durationSec: callDur,
    applied,
    jobsShown,
    engaged,
  });
  const intent = computeIntent({
    durationSec: callDur,
    applied,
    triedToApply,
    jobsShown,
    userIntent: userIntentRaw,
  });

  // campaign metadata — prefer the launch-time stamped values, fall back to derived.
  const campaignDate = (lm.campaignDate && String(lm.campaignDate)) || datePart(callDateIst) || new Date().toISOString().slice(0, 10);
  const campaignType = (lm.campaignType && String(lm.campaignType)) || ctx.batchName || `${ctx.program}_${region.language || ""}`.replace(/_$/, "");
  const campaignDay = (lm.campaignDay && String(lm.campaignDay)) || "";

  const byCol: Record<string, string> = {
    campaign_day: campaignDay,
    campaign_date: campaignDate,
    campaign_type: campaignType,
    language: region.language,
    call_id: callId,
    phone,
    contact_phone: phone,
    call_duration_seconds: fmtInt(callDur),
    call_datetime_ist: fmtDateTimeIst(callDateIst),
    call_outcome: outcome,
    call_answered: callDur > 0 ? "Yes" : "No",
    call_engaged: engaged ? "Yes" : "No",
    applied_to_job: applied ? "Yes" : "No",
    applications_count: fmtInt(jobsApplied.length),
    jobs_shown: jobsShown ? "Yes" : "No",
    primary_topic: primaryTopic,
    call_language: region.language,
    call_recording_url: callRecording,
    final_summary: finalSummary,
    call_transcript: callTranscript,
    tried_to_apply: triedToApply ? "Yes" : "No",
    drop_reason: dropReason,
    city_campaign: region.city,
    // Master leaves these blank — keep consistent.
    seeker_name: "",
    user_intent: "",
    jobs_recommended: JSON.stringify(jobsRecommended ?? []),
    jobs_applied: JSON.stringify(jobsApplied ?? []),
    jobs_failed_to_apply: JSON.stringify(jobsFailed ?? []),
    "intent score": fmtInt(intent.score),
    "intent score reasoning": intent.reasoning,
    intent_score: String(intent.score),
    intent_score_reasoning: intent.reasoning,
    // DKB extras (best-effort passthrough)
    job_id: asStr(get("job_id")),
    company_name: asStr(get("company_name")),
    job_role_input: asStr(get("job_role_input")),
    num_vacancies_input: asStr(get("num_vacancies_input")),
    city_input: asStr(get("city_input")),
    location_input: asStr(get("location_input")),
    salary_input: asStr(get("salary_input")),
    qualification_input: asStr(get("qualification_input")),
    call_status: contactStatus,
    contact_attempts: asStr(contact?.contact_attempts ?? contact?.attempts ?? ""),
    phases_reached: asStr(get("phases_reached")),
    job_status: asStr(get("job_status")),
    job_role_value: asStr(get("job_role_value")),
    num_vacancies_value: asStr(get("num_vacancies_value")),
    salary_value: asStr(get("salary_value")),
    location_value: asStr(get("location_value")),
    qualification_value: asStr(get("qualification_value")),
    fields_updated: asStr(get("fields_updated")),
    new_job_mentioned: asStr(get("new_job_mentioned")),
    new_job_role: asStr(get("new_job_role")),
    new_job_vacancies: asStr(get("new_job_vacancies")),
    new_job_salary: asStr(get("new_job_salary")),
    new_job_location: asStr(get("new_job_location")),
    new_job_qualification: asStr(get("new_job_qualification")),
    new_job_posted: asStr(get("new_job_posted")),
    talent_insights_shown: asStr(get("talent_insights_shown")),
  };

  return ctx.columns.map((col) => {
    const nk = normalize(col);
    if (Object.prototype.hasOwnProperty.call(byCol, nk)) return byCol[nk];
    // case-insensitive header (e.g., "Intent Score")
    const lower = col.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(byCol, lower)) return byCol[lower];
    // best-effort fall through to contact field or agent_args
    const fb = (contact as any)?.[col] ?? (contact as any)?.[nk] ?? ca?.[col] ?? ca?.[nk];
    return asStr(fb);
  });
}

// ---------- fetch all batch contacts ----------
async function fetchAllBatchContacts(batchId: string): Promise<any[]> {
  const pageSize = 200;
  const maxPages = 20;
  const out: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const qs = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    const res = (await rayaFetch(
      `/batch/${encodeURIComponent(batchId)}/contacts?${qs.toString()}`,
      { method: "GET" },
    )) as any;
    const items: any[] =
      res?.contacts ?? res?.items ?? res?.data ?? (Array.isArray(res) ? res : []);
    out.push(...items);
    if (items.length < pageSize) break;
    await delay(500);
  }
  return out;
}

// ---------- main export ----------
export const exportBatchToStaging = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { program: ProgramId; batchId: string; batchName?: string; agentName?: string }) => {
      if (!d.program) throw new Error("program required");
      if (!d.batchId) throw new Error("batchId required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    if (!process.env.RAYA_API_KEY) throw new Error("RAYA_API_KEY not set");

    const c = sb();
    const { data: target, error: te } = await c
      .from("program_export_targets")
      .select("*")
      .eq("program", data.program)
      .maybeSingle();
    if (te) throw new Error(te.message);
    if (!target || !target.sheet_id) {
      throw new Error(
        "No staging sheet configured for this program. Add one in Settings → Results export sheet (staging).",
      );
    }
    if (!target.enabled) throw new Error("Staging export is disabled for this program.");

    // SAFETY: never write to a master.
    const { data: masters, error: me } = await c
      .from("sheet_connections")
      .select("sheet_id,name,program");
    if (me) throw new Error(me.message);
    const clash = (masters ?? []).find(
      (m) => String(m.sheet_id).trim() === String(target.sheet_id).trim(),
    );
    if (clash) {
      throw new Error(
        `Refusing to export — staging sheet matches the master in Connections (${clash.name ?? clash.program}). Update Settings with a different sheet.`,
      );
    }

    const config = registry[data.program];
    if (!config) throw new Error(`Unknown program: ${data.program}`);
    const columns = config.columns;
    const tab = (target.tab_name && target.tab_name.trim()) || "Staging";
    const sheetId = target.sheet_id;

    // Cleanup: if a stray "Staging" tab exists but isn't the configured tab,
    // remove it so all writes converge on the configured tab.
    if (tab !== "Staging") {
      try { await deleteSheetTab(sheetId, "Staging"); } catch { /* ignore */ }
    }

    let existing: Set<string> = new Set();
    let hasHeaders = false;
    try {
      const r = await readStagingCallIds(sheetId, tab);
      existing = r.existing;
      hasHeaders = r.hasHeaders;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await c.from("program_export_targets")
        .update({ last_error: msg })
        .eq("program", data.program);
      throw new Error(`Staging sheet not accessible: ${msg}. Share it with the service account as Editor.`);
    }
    if (!hasHeaders) {
      await writeStagingHeaders(sheetId, tab, columns);
    }

    // Look up launch-time metadata for this batch.
    const { data: lb } = await c
      .from("launched_batches")
      .select("*")
      .eq("batch_id", data.batchId)
      .maybeSingle();
    const launchMeta: LaunchMeta = {
      campaignDay: (lb as any)?.campaign_day ?? null,
      campaignDate: (lb as any)?.campaign_date ?? null,
      campaignType: (lb as any)?.campaign_type ?? null,
      language: (lb as any)?.language ?? null,
      cityCampaign: (lb as any)?.city_campaign ?? null,
      region: (lb as any)?.region ?? null,
      batchName: (lb as any)?.batch_name ?? null,
      agentName: (lb as any)?.agent_name ?? null,
    };

    const contacts = await fetchAllBatchContacts(data.batchId);
    const ctx: BuildCtx = {
      columns,
      program: data.program,
      batchName: data.batchName ?? launchMeta.batchName ?? "",
      agentName: data.agentName ?? launchMeta.agentName ?? "",
      launchMeta,
    };

    const rows: string[][] = [];
    let skippedNoCall = 0;
    let skippedDup = 0;
    let skippedNoId = 0;
    for (const contact of contacts) {
      const lastCall = pickLastCall(contact);
      if (!lastCall) { skippedNoCall++; continue; }
      const row = buildRow(contact, lastCall, ctx);
      if (!row) { skippedNoId++; continue; }
      // call_id position in columns
      const idIdx = columns.findIndex((c) => normalize(c) === "call_id");
      const callId = idIdx >= 0 ? row[idIdx] : "";
      if (!callId) { skippedNoId++; continue; }
      if (existing.has(callId)) { skippedDup++; continue; }
      existing.add(callId);
      rows.push(row);
    }

    let appended = 0;
    if (rows.length > 0) {
      appended = await appendStagingRows(sheetId, tab, rows);
    }

    await c.from("program_export_targets")
      .update({ last_exported_at: new Date().toISOString(), last_error: null })
      .eq("program", data.program);

    return {
      appended,
      totalContacts: contacts.length,
      completed: contacts.length - skippedNoCall,
      skippedNoCall,
      skippedDup,
      skippedNoId,
      sheetId,
      tab,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };
  });

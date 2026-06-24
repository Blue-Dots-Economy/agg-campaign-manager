// Raya → staging-sheet export. NEVER writes to a sheet_id present in
// sheet_connections (the masters). All writeback goes to a separate staging
// sheet configured in program_export_targets.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { delay, rayaFetch } from "./raya-api";
import {
  appendStagingRows,
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
  // bare ID
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
    if (!sheetId) {
      throw new Error("Provide a valid Google Sheet URL or ID.");
    }

    const c = sb();
    // SAFETY GUARD: cannot match any master sheet in sheet_connections.
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

// ---------- helpers for mapping Raya contacts → master columns ----------
function normalize(k: string): string {
  return String(k ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function flattenContact(contact: any): Record<string, any> {
  const out: Record<string, any> = {};
  const walk = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(v);
      } else {
        const nk = normalize(k);
        if (out[nk] === undefined || out[nk] === "" || out[nk] == null) {
          out[nk] = v;
        }
      }
    }
  };
  walk(contact);
  // pull from most-recent execution / call if present
  const execs =
    contact?.executions ?? contact?.calls ?? contact?.call_history ?? null;
  if (Array.isArray(execs) && execs.length > 0) {
    const sorted = [...execs].sort((a, b) => {
      const ta = Date.parse(a?.created_at ?? a?.updated_at ?? a?.call_time ?? "") || 0;
      const tb = Date.parse(b?.created_at ?? b?.updated_at ?? b?.call_time ?? "") || 0;
      return tb - ta;
    });
    walk(sorted[0]);
  }
  return out;
}

const COMPLETED_LIKE = new Set([
  "completed", "answered", "done", "success", "successful",
]);

function isCompleted(contact: any): boolean {
  const s = normalize(contact?.status ?? contact?.call_status ?? "");
  if (COMPLETED_LIKE.has(s)) return true;
  const dur = Number(contact?.call_duration_seconds ?? contact?.duration ?? contact?.duration_seconds ?? 0);
  return Number.isFinite(dur) && dur > 0;
}

function pickCallId(flat: Record<string, any>): string {
  return String(
    flat.call_id ?? flat.callid ?? flat.execution_id ?? flat.id ?? "",
  ).trim();
}

function mapToColumns(columns: string[], flat: Record<string, any>): string[] {
  return columns.map((col) => {
    const nk = normalize(col);
    const v = flat[nk];
    if (v == null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}

// ---------- fetch all batch contacts (paginated, throttled) ----------
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
  .inputValidator((d: { program: ProgramId; batchId: string }) => {
    if (!d.program) throw new Error("program required");
    if (!d.batchId) throw new Error("batchId required");
    return d;
  })
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

    // SAFETY: re-check against masters at write time.
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

    // Read existing call_ids for dedupe + ensure headers.
    let existing: Set<string> = new Set();
    let hasHeaders = false;
    try {
      const r = await readStagingCallIds(sheetId, tab);
      existing = r.existing;
      hasHeaders = r.hasHeaders;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await c
        .from("program_export_targets")
        .update({ last_error: msg })
        .eq("program", data.program);
      throw new Error(`Staging sheet not accessible: ${msg}. Share it with the service account as Editor.`);
    }
    if (!hasHeaders) {
      await writeStagingHeaders(sheetId, tab, columns);
    }

    // Fetch contacts from Raya.
    const contacts = await fetchAllBatchContacts(data.batchId);
    const completed = contacts.filter(isCompleted);

    const rows: string[][] = [];
    let skippedDup = 0;
    let skippedNoId = 0;
    for (const ct of completed) {
      const flat = flattenContact(ct);
      const callId = pickCallId(flat);
      if (!callId) { skippedNoId++; continue; }
      if (existing.has(callId)) { skippedDup++; continue; }
      existing.add(callId);
      rows.push(mapToColumns(columns, flat));
    }

    let appended = 0;
    if (rows.length > 0) {
      appended = await appendStagingRows(sheetId, tab, rows);
    }

    await c
      .from("program_export_targets")
      .update({ last_exported_at: new Date().toISOString(), last_error: null })
      .eq("program", data.program);

    return {
      appended,
      totalContacts: contacts.length,
      completed: completed.length,
      skippedDup,
      skippedNoId,
      sheetId,
      tab,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
    };
  });

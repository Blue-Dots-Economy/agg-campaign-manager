import { createServerFn } from "@tanstack/react-start";
import {
  getCallDetail,
  readStagingCallIds,
  writeStagingHeaders,
  appendStagingRows,
  readReviewedIdsForEmail,
  readAllReviewedIds,
} from "./sheets.server";

export type ReviewDataset = "kkb" | "dkb";

async function sb(program?: ReviewDataset) {
  const { sbFor } = await import("@/lib/db.server");
  return sbFor(program);
}

function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

async function resolveSheet(
  dataset: ReviewDataset,
  channel?: string,
): Promise<{ sheet_id: string; tab_name: string | null }> {
  const client = await sb(dataset);
  const { data, error } = await client
    .from("sheet_connections")
    .select("sheet_id, tab_name, channel")
    .eq("program", dataset)
    .eq("enabled", true);
  if (error) throw new Error(`sheet_connections lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ sheet_id: string; tab_name: string | null; channel: string | null }>;
  if (rows.length === 0) throw new Error(`No enabled sheet connection for dataset '${dataset}'`);
  const want = channel ?? "outbound";
  const pick =
    rows.find((r) => (r.channel ?? "outbound") === want) ??
    rows.find((r) => (r.channel ?? "outbound") === "outbound") ??
    rows[0];
  return { sheet_id: pick.sheet_id, tab_name: pick.tab_name ?? null };
}

const REVIEW_COLS = "call_id, campaign_day, campaign_date, campaign_type, language, city_campaign, call_outcome, call_duration_seconds, intent_score, drop_reason, job_status, phone, channel, data";

function mapReviewRow(r: Record<string, unknown>): Record<string, string> {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const raw = (d.raw ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = d[k] ?? raw[k];
      if (v !== undefined && v !== null && String(v) !== "") return String(v);
    }
    return "";
  };
  const s = (v: unknown) => (v != null ? String(v) : "");
  return {
    call_id: s(r.call_id),
    job_id: pick("job_id"),
    campaign_day: s(r.campaign_day),
    campaign_date: s(r.campaign_date),
    campaign_type: s(r.campaign_type),
    language: s(r.language),
    city_campaign: s(r.city_campaign),
    call_outcome: s(r.call_outcome),
    call_duration_seconds: s(r.call_duration_seconds),
    call_datetime_ist: pick("call_datetime_ist"),
    intent_score: s(r.intent_score),
    drop_reason: s(r.drop_reason),
    job_status: s(r.job_status),
    channel: r.channel != null ? String(r.channel) : "outbound",
    call_recording_url: "",
  };
}

export const fetchReviewCalls = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset }) => data)
  .handler(async ({ data }): Promise<Array<Record<string, string>>> => {
    const client = await sb(data.dataset);
    const rows: Record<string, unknown>[] = [];
    let _from = 0;
    while (true) {
      const { data: batch, error } = await client
        .from("call_rows")
        .select(REVIEW_COLS)
        .eq("program", data.dataset)
        .order("call_id", { ascending: true })
        .range(_from, _from + 999);
      if (error) throw new Error(error.message);
      const b = (batch ?? []) as unknown as Record<string, unknown>[];
      rows.push(...b);
      if (b.length === 0 || rows.length >= 100000) break;
      _from += b.length;
    }
    return rows.map(mapReviewRow);
  });

/** Targeted fetch for a cohort: chunks of 150 ids, at most 5 chunks in flight. */
export const fetchReviewCallsByIds = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset; ids: string[] }) => data)
  .handler(async ({ data }): Promise<Array<Record<string, string>>> => {
    const ids = Array.from(new Set((data.ids ?? []).map((x) => String(x ?? "").trim()).filter(Boolean)));
    if (ids.length === 0) return [];
    const client = await sb(data.dataset);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
    const rows: Record<string, unknown>[] = [];
    let next = 0;
    const worker = async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        const { data: batch, error } = await client
          .from("call_rows")
          .select(REVIEW_COLS)
          .eq("program", data.dataset)
          .in("call_id", chunk);
        if (error) throw new Error(error.message);
        rows.push(...((batch ?? []) as unknown as Record<string, unknown>[]));
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, chunks.length) }, worker));
    const out = new Map<string, Record<string, string>>();
    for (const r of rows) {
      const m = mapReviewRow(r);
      if (!out.has(m.call_id)) out.set(m.call_id, m);
    }
    return Array.from(out.values());
  });

export const fetchCallDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset; callId: string }) => data)
  .handler(async ({ data }) => {
    const client = await sb(data.dataset);
    const { data: row } = await client
      .from("call_rows")
      .select("channel, data")
      .eq("program", data.dataset)
      .eq("call_id", data.callId)
      .maybeSingle();

    // Prefer Supabase: the pipeline stores transcript/recording (and sometimes a
    // summary) inside call_rows.data. Tolerant to key naming across sources.
    const d = ((row as Record<string, unknown> | null)?.data ?? {}) as Record<string, unknown>;
    const raw = (d.raw ?? {}) as Record<string, unknown>;
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = (d as Record<string, unknown>)[k] ?? (raw as Record<string, unknown>)[k];
        if (v != null && String(v).trim() !== "") return String(v);
      }
      return "";
    };
    const transcript = pick("call_transcript", "transcript");
    const recording = pick("call_recording_url", "recording_url", "call_recording", "recording");
    const summary = pick("final_summary", "summary", "call_summary", "ai_summary");
    if (transcript || recording) {
      return { call_transcript: transcript, final_summary: summary, call_recording_url: recording, effectiveTab: "supabase" };
    }

    // Fallback: heavy columns still only in the sheet (older calls / summary).
    const channel = ((row as Record<string, unknown> | null)?.channel as string | undefined) ?? "outbound";
    try {
      const { sheet_id, tab_name } = await resolveSheet(data.dataset, channel);
      const detail = await getCallDetail(sheet_id, tab_name ?? undefined, data.callId);
      if (detail) return detail;
    } catch (e) {
      console.error("[fetchCallDetail] sheet fallback failed:", e);
    }
    return { call_transcript: transcript, final_summary: summary, call_recording_url: recording, effectiveTab: "supabase" };
  });

export const fetchReviewMap = createServerFn({ method: "GET" }).handler(async () => {
  const client = await sb();
  type Row = { call_id: string | null; job_id: string | null; reviewer_email: string | null };
  const out: Row[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await client
      .from("transcript_reviews")
      .select("call_id, job_id, reviewer_email")
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const b = (data ?? []) as Row[];
    if (b.length === 0) break;
    out.push(...b);
    from += b.length;
  }
  return out;
});

export const fetchReviewedCallIds = createServerFn({ method: "GET" })
  .inputValidator((data: { email: string; program?: ReviewDataset }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return [];
    const client = await sb();
    const ids = new Set<string>();
    // 1) Supabase transcript_reviews (paginated past the ~1000-row cap)
    let from = 0;
    while (true) {
      const { data: batch, error } = await client
        .from("transcript_reviews")
        .select("call_id, job_id")
        .eq("reviewer_email", email)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = batch ?? [];
      for (const r of rows as Array<{ call_id: string | null; job_id: string | null }>) {
        if (r.call_id) ids.add(String(r.call_id));
        if (r.job_id) ids.add(String(r.job_id));
      }
      if (rows.length === 0) break;
      from += rows.length;
    }
    // 2) Master sheet "Feedback Responses" tab (durable append-only log). Never throws.
    if (data.program) {
      try {
        const { sheet_id } = await resolveSheet(data.program);
        const sheetIds = await readReviewedIdsForEmail(sheet_id, "Feedback Responses", email);
        for (const v of sheetIds) ids.add(v);
      } catch { /* ignore */ }
    }
    return Array.from(ids);
  });

/** Every call_id/job_id reviewed by ANY reviewer for a program (DB ∪ sheet). */
export const fetchAllReviewedCallIds = createServerFn({ method: "GET" })
  .inputValidator((data: { program: ReviewDataset }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const client = await sb();
    const ids = new Set<string>();
    // 1) Supabase transcript_reviews for this program (+ legacy null-dataset rows), paginated.
    let from = 0;
    while (true) {
      const { data: batch, error } = await client
        .from("transcript_reviews")
        .select("call_id, job_id")
        .or(`dataset.eq.${data.program},dataset.is.null`)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = batch ?? [];
      for (const r of rows as Array<{ call_id: string | null; job_id: string | null }>) {
        if (r.call_id) ids.add(String(r.call_id));
        if (r.job_id) ids.add(String(r.job_id));
      }
      if (rows.length === 0) break;
      from += rows.length;
    }
    // 2) Master sheet "Feedback Responses" tab (all reviewers). Never throws.
    try {
      const { sheet_id } = await resolveSheet(data.program);
      const sheetIds = await readAllReviewedIds(sheet_id, "Feedback Responses");
      for (const v of sheetIds) ids.add(v);
    } catch { /* ignore */ }
    return Array.from(ids);
  });

export const fetchExistingReviews = createServerFn({ method: "GET" })
  .inputValidator((data: { callId?: string | null; jobId?: string | null }) => data)
  .handler(async ({ data }) => {
    const client = await sb();
    const callId = (data.callId ?? "").trim();
    const jobId = (data.jobId ?? "").trim();
    let query = client
      .from("transcript_reviews")
      .select(
        "reviewer_email, reviewer_name, overall_rating, quantitative_issues, reviewer_notes, turn_flags, created_at",
      )
      .order("created_at", { ascending: false });
    if (callId) {
      query = query.eq("call_id", callId);
    } else if (jobId) {
      query = query.eq("job_id", jobId);
    } else {
      return [];
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export interface ReviewInput {
  job_id?: string | null;
  call_id?: string | null;
  reviewer_email: string;
  reviewer_name?: string | null;
  company_name?: string | null;
  campaign_day?: string | null;
  campaign_type?: string | null;
  language?: string | null;
  city_campaign?: string | null;
  contact_phone?: string | null;
  call_outcome?: string | null;
  job_status_in_master?: string | null;
  review_type?: string | null;
  quantitative_issues?: string | null;
  turn_flags?: string | null;
  overall_rating?: number | null;
  reviewer_notes?: string | null;
  summary_match?: string | null;
  job_status_correct?: string | null;
  output_fields_accurate?: string | null;
  dataset: ReviewDataset;
}

const FEEDBACK_COLUMNS = [
  "timestamp",
  "reviewer_email",
  "reviewer_name",
  "campaign_day",
  "campaign_type",
  "language",
  "city_campaign",
  "company_name",
  "contact_phone",
  "job_id",
  "call_id",
  "call_outcome",
  "job_status_in_master",
  "quantitative_issues",
  "turn_flags",
  "overall_rating",
  "reviewer_notes",
  "review_type",
  "dataset",
];

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((data: { review: ReviewInput }) => data)
  .handler(async ({ data }) => {
    const review: ReviewInput = { review_type: "transcript", ...data.review, company_name: "" };
    const client = await sb();
    const { error } = await client
      .from("transcript_reviews")
      .upsert(review as unknown as Record<string, unknown>, {
        onConflict: "call_id,reviewer_email",
      });
    if (error) throw new Error(error.message);

    // Append to master sheet's "Feedback Responses" tab. Never fail the DB write on a sheet hiccup.
    try {
      const { sheet_id } = await resolveSheet(review.dataset);
      const tab = "Feedback Responses";
      const state = await readStagingCallIds(sheet_id, tab);
      if (!state.hasHeaders) {
        await writeStagingHeaders(sheet_id, tab, FEEDBACK_COLUMNS);
      }
      const timestamp = new Date().toISOString();
      const rec: Record<string, unknown> = { ...(review as unknown as Record<string, unknown>), timestamp };
      const row = FEEDBACK_COLUMNS.map((c) => {
        const v = rec[c];
        return v === null || v === undefined ? "" : String(v);
      });
      await appendStagingRows(sheet_id, tab, [row]);
    } catch (e) {
      console.error("[submitReview] sheet append failed:", e);
    }

    return { ok: true };
  });

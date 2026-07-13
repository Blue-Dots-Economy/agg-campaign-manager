import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import {
  readSheetForReview,
  getCallDetail,
  readStagingCallIds,
  writeStagingHeaders,
  appendStagingRows,
} from "./sheets.server";

export type ReviewDataset = "kkb" | "dkb";

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

async function resolveSheet(
  dataset: ReviewDataset,
): Promise<{ sheet_id: string; tab_name: string | null }> {
  const client = sb();
  const { data, error } = await client
    .from("sheet_connections")
    .select("sheet_id, tab_name")
    .eq("program", dataset)
    .eq("enabled", true)
    .limit(1);
  if (error) throw new Error(`sheet_connections lookup failed: ${error.message}`);
  const row = (data ?? [])[0];
  if (!row) throw new Error(`No enabled sheet connection for dataset '${dataset}'`);
  return { sheet_id: row.sheet_id as string, tab_name: (row.tab_name as string | null) ?? null };
}

// --- Review call queue (per-dataset cache) ---

type ReviewRow = Record<string, string>;
const CACHE_TTL_MS = 60_000;
const cache = new Map<ReviewDataset, { at: number; rows: ReviewRow[] }>();
const inflight = new Map<ReviewDataset, Promise<ReviewRow[]>>();

async function loadReviewCalls(dataset: ReviewDataset): Promise<ReviewRow[]> {
  const now = Date.now();
  const cached = cache.get(dataset);
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.rows;
  const existing = inflight.get(dataset);
  if (existing) return existing;

  const p = (async () => {
    const { sheet_id, tab_name } = await resolveSheet(dataset);
    const { headers, rows } = await readSheetForReview(sheet_id, tab_name ?? undefined);
    const normHeaders = headers.map(normKey);
    const out: ReviewRow[] = rows.map((r) => {
      const o: ReviewRow = {};
      for (let i = 0; i < normHeaders.length; i++) {
        o[normHeaders[i]] = r[i] ?? "";
      }
      return o;
    });
    cache.set(dataset, { at: Date.now(), rows: out });
    return out;
  })();
  inflight.set(dataset, p);
  try {
    return await p;
  } finally {
    inflight.delete(dataset);
  }
}

export const fetchReviewCalls = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset }) => data)
  .handler(async ({ data }) => {
    return await loadReviewCalls(data.dataset);
  });

export const fetchCallDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset; callId: string }) => data)
  .handler(async ({ data }) => {
    const { sheet_id, tab_name } = await resolveSheet(data.dataset);
    const detail = await getCallDetail(sheet_id, tab_name ?? undefined, data.callId);
    return (
      detail ?? { call_transcript: "", final_summary: "", call_recording_url: "", effectiveTab: "" }
    );
  });

export const fetchReviewMap = createServerFn({ method: "GET" }).handler(async () => {
  const client = sb();
  const { data, error } = await client
    .from("transcript_reviews")
    .select("call_id, job_id, reviewer_email");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    call_id: string | null;
    job_id: string | null;
    reviewer_email: string | null;
  }>;
});

export const fetchExistingReviews = createServerFn({ method: "GET" })
  .inputValidator((data: { callId?: string | null; jobId?: string | null }) => data)
  .handler(async ({ data }) => {
    const client = sb();
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
    const review: ReviewInput = { review_type: "transcript", ...data.review };
    const client = sb();
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

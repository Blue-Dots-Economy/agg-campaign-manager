import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { rayaFetch } from "./raya-api";

// The master journey tables + pick RPCs live in the campaign-manager project
// (NEW_SUPABASE_*), for ALL users — not sbFor(), which is per-actor/per-program.
function masterClient(): SupabaseClient | null {
  const url = process.env.NEW_SUPABASE_URL;
  const key = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface MasterFilters {
  program: "kkb" | "dkb";
  confidenceMin?: number | null;
  maxCampaigns?: number | null;
  cooldownDays?: number | null;
  region?: string | null;
  status?: string | null;
  limit?: number | null;
}

interface PreviewSampleRow {
  phone_masked: string; region: string; district: string; status: string; category: string;
  confidence: number | null; total_campaigns: number; last_call_date: string;
  avg_intent: number | null; max_intent: number | null; avg_match: number | null;
}

function rpcArgs(f: MasterFilters) {
  return {
    _program: f.program,
    _confidence_min: f.confidenceMin ?? null,
    _max_campaigns: f.maxCampaigns ?? null,
    _cooldown_days: f.cooldownDays ?? null,
    _region: f.region ?? null,
  };
}

export const previewMasterCohort = createServerFn({ method: "POST" })
  .inputValidator((d: MasterFilters) => d)
  .handler(async ({ data }) => {
    const client = masterClient();
    if (!client) return { available: false, total: 0, confidenceAvailable: false, sample: [] as PreviewSampleRow[], regions: [] as string[], statuses: [] as string[] };
    const { data: res, error } = await client.rpc("pick_preview", rpcArgs(data));
    if (error) throw new Error(error.message);
    const p = (res ?? {}) as { count?: number; regions?: string[]; confidenceAvailable?: boolean; sample?: PreviewSampleRow[] };
    return {
      available: true,
      total: Number(p.count ?? 0),
      confidenceAvailable: !!p.confidenceAvailable,
      sample: Array.isArray(p.sample) ? p.sample : [],
      regions: Array.isArray(p.regions) ? p.regions : [],
      statuses: [] as string[],
    };
  });

export const resolveMasterCohort = createServerFn({ method: "POST" })
  .inputValidator((d: MasterFilters) => d)
  .handler(async ({ data }) => {
    const client = masterClient();
    if (!client) return { contacts: [] as Array<Record<string, string>>, enrichedCount: 0, enrichmentSkipped: false };
    const { data: res, error } = await client.rpc("pick_resolve", { ...rpcArgs(data), _lim: data.limit ?? null });
    if (error) throw new Error(error.message);
    const p = (res ?? {}) as { contacts?: Array<Record<string, string>>; enrichedCount?: number };
    return {
      contacts: Array.isArray(p.contacts) ? p.contacts : [],
      enrichedCount: Number(p.enrichedCount ?? 0),
      enrichmentSkipped: false,
    };
  });

// Server-side create: resolve+enrich via RPC, then create the Raya batch — the
// contact list never travels to the browser (avoids the large-payload 502).
export const createMasterBatch = createServerFn({ method: "POST" })
  .inputValidator((d: { filters: MasterFilters; agentId: string; batchName: string }) => d)
  .handler(async ({ data }) => {
    if (!data.agentId) throw new Error("Missing agent id.");
    if (!data.batchName) throw new Error("Missing batch name.");
    const client = masterClient();
    if (!client) throw new Error("Master record source isn't configured (NEW_SUPABASE_* missing).");
    const { data: res, error } = await client.rpc("pick_resolve", { ...rpcArgs(data.filters), _lim: data.filters.limit ?? null });
    if (error) throw new Error(error.message);
    const p = (res ?? {}) as { contacts?: Array<Record<string, string>>; enrichedCount?: number };
    const contacts = Array.isArray(p.contacts) ? p.contacts : [];
    if (contacts.length === 0) throw new Error("No contacts matched the filters.");

    const r = (await rayaFetch("/batch", {
      method: "POST",
      json: { agent_id: data.agentId, batch_name: data.batchName, contacts },
    })) as Record<string, any>;

    const rawId =
      r.batchId ?? r.batch_id ?? r.id ?? r.data?.batchId ?? r.data?.batch_id ?? r.data?.id ?? r.batch?.id ?? r.batch?.batchId;
    if (r.status === "error" || !rawId) {
      throw new Error(r.message ? String(r.message) : "Raya did not return a batchId.");
    }
    return { ok: true as const, batchId: String(rawId), count: contacts.length, enrichedCount: Number(p.enrichedCount ?? 0) };
  });

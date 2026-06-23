// Account-wide concurrency budget across all Raya batches.
// Raya gives ONE pool (default 20) shared by every agent / program.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export const CONCURRENCY_CAP_DEFAULT = 20;

const ACTIVE_STATUSES = new Set([
  "running",
  "scheduled",
  "processing",
  "in_progress",
  "in progress",
  "active",
  "queued",
  "pending",
  "started",
  "live",
]);

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

interface ActiveBatch {
  program: string;
  agentName: string;
  agentId: string;
  batchId: string;
  batchName: string;
  concurrency: number;
  status: string;
}

async function rayaListAgentBatches(agentId: string, apiKey: string): Promise<any[]> {
  const qs = new URLSearchParams({ agent_id: agentId, page_size: "100" });
  const res = await fetch(`https://v1.getraya.app/api/batch?${qs.toString()}`, {
    method: "GET",
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { return []; }
  const items: any[] =
    parsed?.items ?? parsed?.data ?? parsed?.batches ?? (Array.isArray(parsed) ? parsed : []);
  return items;
}

function pickConcurrency(item: any): number {
  const c =
    item?.concurrency ??
    item?.max_concurrency ??
    item?.parallel_calls ??
    item?.parallelCalls ??
    item?.schedule?.concurrency ??
    item?.settings?.concurrency ??
    0;
  const n = Number(c);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const getConcurrencyUsage = createServerFn({ method: "GET" })
  .inputValidator((d: { cap?: number }) => d ?? {})
  .handler(async ({ data }) => {
    const cap = Number.isFinite(data?.cap) && (data!.cap as number) > 0
      ? (data!.cap as number)
      : CONCURRENCY_CAP_DEFAULT;

    const apiKey = process.env.RAYA_API_KEY;
    if (!apiKey) {
      return { cap, used: 0, available: cap, batches: [] as ActiveBatch[], error: "RAYA_API_KEY not set" };
    }

    const c = sb();
    const { data: agents, error } = await c
      .from("program_agents")
      .select("program,agent_id,name");
    if (error) {
      return { cap, used: 0, available: cap, batches: [] as ActiveBatch[], error: error.message };
    }

    const active: ActiveBatch[] = [];
    // Sequential to respect Raya's 1 req/20s rate limit lightly; agents list is small.
    const results = await Promise.all(
      (agents ?? []).map(async (a) => {
        const items = await rayaListAgentBatches(a.agent_id, apiKey);
        const out: ActiveBatch[] = [];
        for (const item of items) {
          const status = String(item?.status ?? "").toLowerCase().trim();
          if (!ACTIVE_STATUSES.has(status)) continue;
          const concurrency = pickConcurrency(item);
          if (concurrency <= 0) continue;
          out.push({
            program: String(a.program),
            agentName: String(a.name ?? a.agent_id),
            agentId: String(a.agent_id),
            batchId: String(item.id ?? item.batch_id ?? item.batchId ?? ""),
            batchName: String(item.name ?? item.batch_name ?? "—"),
            concurrency,
            status,
          });
        }
        return out;
      }),
    );
    for (const r of results) active.push(...r);

    const used = active.reduce((s, b) => s + b.concurrency, 0);
    const available = Math.max(0, cap - used);
    return { cap, used, available, batches: active };
  });

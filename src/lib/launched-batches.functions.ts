// Records campaign metadata for each Raya batch launched from the wizard.
// The staging export joins on batch_id to stamp campaign columns onto rows.

import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export interface LaunchedBatchRow {
  batch_id: string;
  program: string;
  agent_id: string | null;
  agent_name: string | null;
  batch_name: string | null;
  campaign_day: string | null;
  campaign_date: string | null;
  campaign_type: string | null;
  language: string | null;
  city_campaign: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
}

export const recordLaunchedBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      batchId: string;
      program: string;
      agentId?: string;
      agentName?: string;
      batchName?: string;
      campaignDay?: string;
      campaignDate?: string;
      campaignType?: string;
      language?: string;
      cityCampaign?: string;
      region?: string;
    }) => {
      if (!d.batchId) throw new Error("batchId required");
      if (!d.program) throw new Error("program required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const c = sb();
    const payload = {
      batch_id: data.batchId,
      program: data.program,
      agent_id: data.agentId ?? null,
      agent_name: data.agentName ?? null,
      batch_name: data.batchName ?? null,
      campaign_day: data.campaignDay ?? null,
      campaign_date: data.campaignDate ?? null,
      campaign_type: data.campaignType ?? null,
      language: data.language ?? null,
      city_campaign: data.cityCampaign ?? null,
      region: data.region ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await c
      .from("launched_batches")
      .upsert(payload, { onConflict: "batch_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row as LaunchedBatchRow;
  });

export const getNextCampaignDay = createServerFn({ method: "GET" })
  .inputValidator((d: { program: string }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    const c = sb();
    const { data: rows } = await c
      .from("launched_batches")
      .select("campaign_day")
      .eq("program", data.program)
      .order("created_at", { ascending: false })
      .limit(50);
    let maxN = 0;
    for (const r of rows ?? []) {
      const m = String((r as any).campaign_day ?? "").match(/(\d+)/);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    return { next: `Day ${maxN + 1}` };
  });

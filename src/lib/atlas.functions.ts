// ATLAS Mark I — shadow mode. Proposes cohorts only; NEVER dispatches.
// No Raya, no pick_resolve, no Campaign Manager calls anywhere in this file.
import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const BUDGET_CAP = 1000;
const OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

// ATLAS state lives in the CURRENT project, regardless of cutover flags.
function stateDb(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, OPTS);
}
function masterClient(): SupabaseClient | null {
  const url = process.env.NEW_SUPABASE_URL;
  const key = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, OPTS);
}

async function requireAtlasActor(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { isAtlasPilot } = await import("@/auth/permissions");
  let email: string | null = null;
  try {
    const cookie = getRequest()?.headers?.get("cookie") ?? "";
    const m = cookie.split("; ").find((c) => c.startsWith("rozgar_auth="));
    if (m) email = String(JSON.parse(decodeURIComponent(m.split("=").slice(1).join("=")))?.email ?? "").trim().toLowerCase() || null;
  } catch { email = null; }
  if (!email) throw new Error("Not authorized for ATLAS.");
  if (isAtlasPilot(email)) return email;
  // Admin check against the user registry (not the client-set role).
  const { data } = await stateDb().from("app_users").select("role, active").eq("email", email).maybeSingle();
  if (data && (data as any).role === "admin" && (data as any).active !== false) return email;
  throw new Error("Not authorized for ATLAS.");
}

async function getControl() {
  const { data, error } = await stateDb().from("atlas_control").select("dispatch_enabled, killed").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  return { dispatch_enabled: !!data?.dispatch_enabled, killed: data ? !!data.killed : true };
}

export interface AtlasBuildInput {
  program: "kkb" | "dkb";
  region?: string | null;
  budget?: number | null;
  confidenceMin?: number | null;
  cooldownDays?: number | null;
  maxCampaigns?: number | null;
  explorePct?: number | null;
}

interface SampleRow {
  phone_masked: string; region: string; district: string; category: string;
  confidence: number | null; total_campaigns: number; last_call_date: string;
  avg_intent: number | null; max_intent: number | null; avg_match: number | null;
}

const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const hasVal = (v: unknown) => v != null && String(v).trim() !== "" && String(v).trim() !== "—";
function daysSince(d: string): number | null {
  const t = Date.parse(d);
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}

export const atlasBuildCohort = createServerFn({ method: "POST" })
  .inputValidator((d: AtlasBuildInput) => d)
  .handler(async ({ data }) => {
    const actor = await requireAtlasActor();
    const budget = Math.max(1, Math.min(Number(data.budget ?? BUDGET_CAP) || BUDGET_CAP, BUDGET_CAP));
    const explorePct = Math.max(0, Math.min(Number(data.explorePct ?? 15), 50));
    const ctl = await getControl();
    if (ctl.killed) throw new Error("ATLAS is halted (kill switch on).");

    const client = masterClient();
    if (!client) throw new Error("Master record source isn't configured.");
    const { data: res, error } = await client.rpc("pick_preview", {
      _program: data.program,
      _confidence_min: data.confidenceMin ?? null,
      _max_campaigns: data.maxCampaigns ?? null,
      _cooldown_days: data.cooldownDays ?? null,
      _region: data.region || null,
    });
    if (error) throw new Error(error.message);
    const p = (res ?? {}) as { count?: number; regions?: string[]; confidenceAvailable?: boolean; sample?: SampleRow[] };
    const matched = Number(p.count ?? 0);
    const totalCount = Math.min(matched, budget);
    const sample = Array.isArray(p.sample) ? p.sample : [];

    // Score: confidence + intent/match up; campaigns run + very recent contact down.
    const scored = sample.map((r) => {
      const conf = num(r.confidence);
      const intent = num(r.max_intent) ?? num(r.avg_intent);
      const match = num(r.avg_match);
      const camps = Number(r.total_campaigns ?? 0);
      const ds = daysSince(r.last_call_date);
      let s = 0;
      s += (conf ?? 5) / 10 * 40;
      s += (intent != null ? Math.min(intent, 10) / 10 : 0.4) * 30;
      s += (match != null ? Math.min(match, 10) / 10 : 0.4) * 20;
      s -= Math.min(camps, 10) * 4;
      if (ds != null && ds < 14) s -= (14 - ds) * 1.5;
      return { r, conf, intent, match, camps, ds, score: s };
    });

    const kExplore = Math.round((scored.length * explorePct) / 100);
    const byLeast = [...scored].sort((a, b) => a.camps - b.camps || (b.ds ?? 0) - (a.ds ?? 0));
    const exploreSet = new Set(byLeast.slice(0, kExplore));

    const members = scored.map((x) => {
      const isExp = exploreSet.has(x);
      const score = Math.round((x.score + (isExp ? 10 : 0)) * 10) / 10;
      let reason: string;
      if (isExp) reason = x.camps === 0 ? "Never reached by a campaign — exploration" : x.ds != null && x.ds > 30 ? "Not called in a while — exploration" : "Lightly contacted so far — exploration";
      else if (x.conf != null && x.conf >= 8 && (x.intent ?? 0) >= 6) reason = "Strong confidence and clear intent";
      else if (x.camps >= 2 && (x.intent ?? 0) >= 5) reason = `Engaged across ${x.camps} campaigns, still showing intent — worth a nudge`;
      else if (x.match != null && x.match >= 6) reason = "Good job match on record";
      else reason = "Meets your filters; moderate signal";
      return {
        phone_masked: x.r.phone_masked, region: x.r.region, district: x.r.district,
        category: hasVal(x.r.category) ? x.r.category : null,
        confidence: x.conf, total_campaigns: x.camps, last_call_date: x.r.last_call_date,
        intent: x.intent, match: x.match, priority_score: score, reason, is_exploration: isExp,
      };
    }).sort((a, b) => b.priority_score - a.priority_score);

    const byRegion: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const m of members) {
      const rg = hasVal(m.region) ? m.region : "Unknown";
      byRegion[rg] = (byRegion[rg] ?? 0) + 1;
      if (m.category) byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    }
    const categoryAvailable = Object.keys(byCategory).length > 0;
    const fairness = {
      byRegion, byCategory, categoryAvailable,
      note: categoryAvailable ? null : "Category data not yet available — SC/ST fairness check pending.",
    };

    const regionLabel = data.region || "all regions";
    const expShare = members.length ? Math.round((kExplore / members.length) * totalCount) : 0;
    const fairnessSentence = categoryAvailable
      ? `Across the preview, categories are spread as ${Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(", ")} — I'd still like a human eye on that balance`
      : "I can't check fairness by category yet because that data isn't available, so treat that part as unverified";
    const capNote = matched > budget ? `, capped at your daily budget of ${budget} out of ${matched} who qualify` : matched === 0 ? "" : `, which is everyone who qualifies`;
    const narration = totalCount === 0
      ? `I looked for people in ${regionLabel} who meet these filters and found no one. I'd suggest loosening the confidence threshold or cooldown before trying again.`
      : `Here's my plan for ${regionLabel}: ${totalCount} people today${capNote}. Most are strong matches, but I've deliberately included about ${expShare} we haven't reached much — they deserve a shot even if I'm less certain about them. ${fairnessSentence}. ${p.confidenceAvailable ? "" : "Confidence scores are missing for this pool, so my ranking leans on intent and history. "}This is my recommendation — you approve before anything runs.`;

    const db = stateDb();
    const { data: row, error: insErr } = await db.from("atlas_cohorts").insert({
      program: data.program, region: data.region || null, budget,
      confidence_min: data.confidenceMin ?? null, cooldown_days: data.cooldownDays ?? null,
      max_campaigns: data.maxCampaigns ?? null, explore_pct: explorePct,
      status: "proposed", model_mark: "Mark I", total_count: totalCount,
      narration, fairness, params: { ...data, budget, explorePct, matched }, created_by: actor,
    }).select("id").single();
    if (insErr) throw new Error(insErr.message);
    const cohortId = (row as any).id as string;
    if (members.length) {
      const { error: mErr } = await db.from("atlas_cohort_members").insert(members.map((m) => ({ ...m, cohort_id: cohortId })));
      if (mErr) throw new Error(mErr.message);
    }
    return { cohortId, totalCount, sampleCount: members.length, exploreCount: kExplore, fairness, narration, confidenceAvailable: !!p.confidenceAvailable, regions: Array.isArray(p.regions) ? p.regions : [] };
  });

export const atlasListCohorts = createServerFn({ method: "POST" }).handler(async () => {
  await requireAtlasActor();
  const { data, error } = await stateDb().from("atlas_cohorts")
    .select("id, created_at, program, region, total_count, status, model_mark")
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
});

export const atlasGetCohort = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAtlasActor();
    const db = stateDb();
    const { data: cohort, error } = await db.from("atlas_cohorts").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!cohort) throw new Error("Cohort not found.");
    const { data: members, error: mErr } = await db.from("atlas_cohort_members").select("*").eq("cohort_id", data.id).order("priority_score", { ascending: false });
    if (mErr) throw new Error(mErr.message);
    return { cohort: cohort as any, members: (members ?? []) as any[] };
  });

export const atlasGetControl = createServerFn({ method: "POST" }).handler(async () => {
  await requireAtlasActor();
  return getControl();
});

export const atlasSetControl = createServerFn({ method: "POST" })
  .inputValidator((d: { killed?: boolean; dispatch_enabled?: boolean }) => d)
  .handler(async ({ data }) => {
    await requireAtlasActor();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof data.killed === "boolean") patch.killed = data.killed;
    if (typeof data.dispatch_enabled === "boolean") patch.dispatch_enabled = data.dispatch_enabled; // no effect in Mark I
    const { error } = await stateDb().from("atlas_control").upsert({ id: true, ...patch });
    if (error) throw new Error(error.message);
    return getControl();
  });

export const atlasApproveCohort = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAtlasActor();
    const ctl = await getControl();
    if (ctl.killed) throw new Error("ATLAS is halted (kill switch on).");
    // SHADOW STUB. Real dispatch lands in a later Mark once verified.
    // Must NOT call Raya or the Campaign Manager API.
    const { error } = await stateDb().from("atlas_cohorts").update({ status: "approved" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { shadow: true as const, message: "Shadow mode — approved for review only. No calls were placed." };
  });

export const atlasCancelCohort = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAtlasActor();
    const { error } = await stateDb().from("atlas_cohorts").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

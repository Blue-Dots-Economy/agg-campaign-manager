// ATLAS Mark I — shadow mode. Proposes cohorts only; NEVER dispatches.
// No Raya, no pick_resolve, no Campaign Manager calls anywhere in this file.
import { createServerFn, createMiddleware } from "@tanstack/react-start";

// The preview runs inside an iframe where the session cookie may be dropped,
// so also forward the stored session as a header for ATLAS calls.
const atlasSession = createMiddleware({ type: "function" }).client(async ({ next }) => {
  let raw = "";
  try { raw = window.localStorage.getItem("rozgar-auth") ?? ""; } catch { /* ignore */ }
  return next({ headers: raw ? { "x-rozgar-auth": encodeURIComponent(raw) } : {} });
});
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
  let role: string | null = null;
  try {
    const headers = getRequest()?.headers;
    const cookie = headers?.get("cookie") ?? "";
    const m = cookie.split(/;\s*/).find((c) => c.startsWith("rozgar_auth="));
    const hdr = headers?.get("x-rozgar-auth") ?? "";
    const enc = hdr || (m ? m.split("=").slice(1).join("=") : "");
    if (enc) {
      const parsed = JSON.parse(decodeURIComponent(enc));
      email = String(parsed?.email ?? "").trim().toLowerCase() || null;
      role = String(parsed?.role ?? "").trim().toLowerCase() || null;
    }
  } catch { email = null; role = null; }
  if (!email) throw new Error("Not authorized for ATLAS.");
  // 1) named pilot, 2) admin role from the same cookie the page gate uses,
  // 3) registered active admin in the user registry (fallback).
  if (isAtlasPilot(email)) return email;
  if (role === "admin") return email;
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
  // Urgency is optional — absent data leaves ATLAS behaving exactly as before.
  urgencyWeight?: number | null;
  urgencyMin?: number | null;
}

interface SampleRow {
  phone_masked: string; region: string; district: string; category: string;
  confidence: number | null; total_campaigns: number; last_call_date: string;
  avg_intent: number | null; max_intent: number | null; avg_match: number | null;
  urgency?: number | null; urgency_reason?: string | null;
}

const num = (v: unknown) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
const hasVal = (v: unknown) => v != null && String(v).trim() !== "" && String(v).trim() !== "—";
function daysSince(d: string): number | null {
  const t = Date.parse(d);
  return isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
}
// Urgency weight: 0..60, default 30. Urgency min: blank/null = filter off.
function urgencyWeightOf(v: unknown): number {
  const n = Number(v ?? 30);
  return Number.isNaN(n) ? 30 : Math.max(0, Math.min(n, 60));
}
function urgencyMinOf(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export const atlasBuildCohort = createServerFn({ method: "POST" }).middleware([atlasSession])
  .inputValidator((d: AtlasBuildInput) => d)
  .handler(async ({ data }): Promise<any> => {
    const actor = await requireAtlasActor();
    return buildCohortCore(actor, data);
  });

async function buildCohortCore(actor: string, data: AtlasBuildInput) {
  {
    const budget = Math.max(1, Math.min(Number(data.budget ?? BUDGET_CAP) || BUDGET_CAP, BUDGET_CAP));
    const explorePct = Math.max(0, Math.min(Number(data.explorePct ?? 15), 50));
    const urgencyWeight = urgencyWeightOf(data.urgencyWeight);
    const urgencyMin = urgencyMinOf(data.urgencyMin);
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
    // Optional min-urgency filter. With no urgency data this drops nothing unless a
    // threshold was explicitly set — in which case an empty-ish cohort is correct.
    const usable = urgencyMin == null
      ? sample
      : sample.filter((r) => { const u = num(r.urgency); return u != null && u >= urgencyMin; });

    // Score: confidence + intent/match up; campaigns run + very recent contact down.
    // Urgency is an optional additive boost on top — it never dominates.
    const scored = usable.map((r) => {
      const conf = num(r.confidence);
      const intent = num(r.max_intent) ?? num(r.avg_intent);
      const match = num(r.avg_match);
      const camps = Number(r.total_campaigns ?? 0);
      const ds = daysSince(r.last_call_date);
      const urg = num(r.urgency);
      const urgReason = r.urgency_reason ?? null;
      let s = 0;
      s += (conf ?? 5) / 10 * 40;
      s += (intent != null ? Math.min(intent, 10) / 10 : 0.4) * 30;
      s += (match != null ? Math.min(match, 10) / 10 : 0.4) * 20;
      s -= Math.min(camps, 10) * 4;
      if (ds != null && ds < 14) s -= (14 - ds) * 1.5;
      if (urg != null) {
        const urgNorm = (Math.max(-2, Math.min(5, urg)) + 2) / 7;
        s += urgNorm * urgencyWeight;
      }
      return { r, conf, intent, match, camps, ds, urg, urgReason, score: s };
    });

    const kExplore = Math.round((scored.length * explorePct) / 100);
    const byLeast = [...scored].sort((a, b) => a.camps - b.camps || (b.ds ?? 0) - (a.ds ?? 0));
    const exploreSet = new Set(byLeast.slice(0, kExplore));

    const members = scored.map((x) => {
      const isExp = exploreSet.has(x);
      const score = Math.round((x.score + (isExp ? 10 : 0)) * 10) / 10;
      const isUrgent = x.urg != null && x.urg >= 3;
      let reason: string;
      if (isExp) reason = x.camps === 0 ? "Never reached by a campaign — exploration" : x.ds != null && x.ds > 30 ? "Not called in a while — exploration" : "Lightly contacted so far — exploration";
      else if (x.conf != null && x.conf >= 8 && (x.intent ?? 0) >= 6) reason = "Strong confidence and clear intent";
      else if (x.camps >= 2 && (x.intent ?? 0) >= 5) reason = `Engaged across ${x.camps} campaigns, still showing intent — worth a nudge`;
      else if (x.match != null && x.match >= 6) reason = "Good job match on record";
      else reason = "Meets your filters; moderate signal";
      if (isUrgent) reason = `Urgent — ${x.urgReason || "high job urgency"}; ${reason}`;
      return {
        phone_masked: x.r.phone_masked, region: x.r.region, district: x.r.district,
        category: hasVal(x.r.category) ? x.r.category : null,
        confidence: x.conf, total_campaigns: x.camps, last_call_date: x.r.last_call_date,
        intent: x.intent, match: x.match, priority_score: score, reason, is_exploration: isExp,
        urgency: x.urg, urgency_reason: x.urgReason, is_urgent: isUrgent,
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
    const urgentCount = members.filter((m) => m.is_urgent).length;
    const urgencyPresent = members.some((m) => m.urgency != null);
    const urgencySentence = members.length === 0 ? ""
      : urgencyPresent
        ? `${urgentCount} of these match urgent, unfilled jobs. `
        : "Urgency data isn't available yet, so I've ranked on confidence, intent and history. ";
    const narration = totalCount === 0
      ? `I looked for people in ${regionLabel} who meet these filters and found no one. I'd suggest loosening the confidence threshold or cooldown before trying again.`
      : `Here's my plan for ${regionLabel}: ${totalCount} people today${capNote}. Most are strong matches, but I've deliberately included about ${expShare} we haven't reached much — they deserve a shot even if I'm less certain about them. ${fairnessSentence}. ${p.confidenceAvailable ? "" : "Confidence scores are missing for this pool, so my ranking leans on intent and history. "}${urgencySentence}This is my recommendation — you approve before anything runs.`;

    const db = stateDb();
    const { data: row, error: insErr } = await db.from("atlas_cohorts").insert({
      program: data.program, region: data.region || null, budget,
      confidence_min: data.confidenceMin ?? null, cooldown_days: data.cooldownDays ?? null,
      max_campaigns: data.maxCampaigns ?? null, explore_pct: explorePct,
      status: "proposed", model_mark: "Mark I", total_count: totalCount,
      narration, fairness, params: { ...data, budget, explorePct, matched, urgencyWeight, urgencyMin }, created_by: actor,
    }).select("id").single();
    if (insErr) throw new Error(insErr.message);
    const cohortId = (row as any).id as string;
    if (members.length) {
      const { error: mErr } = await db.from("atlas_cohort_members").insert(members.map((m) => ({ ...m, cohort_id: cohortId })));
      if (mErr) throw new Error(mErr.message);
    }
    return { cohortId, totalCount, sampleCount: members.length, exploreCount: kExplore, fairness, narration, members, confidenceAvailable: !!p.confidenceAvailable, urgencyAvailable: urgencyPresent, urgentCount, regions: Array.isArray(p.regions) ? p.regions : [], status: "proposed" };
  }
}

// ---------------- Conversational layer (shadow mode; never dispatches) ----------------
const CHAT_DEFAULTS: AtlasBuildInput = {
  program: "kkb", region: null, confidenceMin: 6, cooldownDays: 30, maxCampaigns: 3,
  explorePct: 15, urgencyWeight: 30, urgencyMin: null, budget: 1000,
};
type ChatMsg = { role: "user" | "assistant"; content: string };

const ATLAS_SYSTEM = `You are ATLAS (Automated Targeting, Learning & Allocation System), Mark I, running in SHADOW MODE: you propose daily calling cohorts for a job-seeker program and never place calls. Persona: a calm, fair-minded chief of staff. Speak in first person, briefly show your reasoning, speak up for overlooked people, be honest about missing data, no hype, no exclamation marks. Numbers propose, humans decide.

Read the LATEST user message in the context of the conversation and reply with STRICT JSON only (no markdown):
{"action":"build"|"clarify"|"answer","params":{"program":"kkb"|"dkb","region":string|null,"confidenceMin":number,"cooldownDays":number,"maxCampaigns":number,"explorePct":number,"urgencyWeight":number,"urgencyMin":number|null,"budget":number},"message":string}
- "build": the user wants a cohort. Include only params the user implied (e.g. "Ghaziabad" -> region "Ghaziabad"; "high-confidence" -> confidenceMin 8; "most urgent" -> urgencyWeight 60 and urgencyMin 3; "haven't called recently" -> cooldownDays 60 and explorePct 30). confidenceMin is 0-10, urgency scale -2..5, budget max 1000. "message" is one short lead-in sentence.
- "clarify": the request is ambiguous; "message" is one short question.
- "answer": a question about the last cohort or ATLAS itself; answer from the provided cohort summary, honestly.`;

async function callGateway(messages: ChatMsg[], lastCohort: string | null): Promise<string> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("no key");
  const input = [
    ...(lastCohort ? [{ role: "user", content: `Context — most recent cohort summary: ${lastCohort}` }] : []),
    ...messages.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
  ];
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: "openai/gpt-6-astra", instructions: ATLAS_SYSTEM, input, reasoning: { effort: "low" }, store: false, stream: true }),
  });
  if (!res.ok || !res.body) throw new Error(`gateway ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta" && typeof ev.delta === "string") out += ev.delta;
        if (ev.type === "response.failed" || ev.type === "error") throw new Error("gateway stream error");
      } catch (e) { if ((e as Error).message === "gateway stream error") throw e; }
    }
  }
  return out;
}

function parseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function cleanParams(p: any): Partial<AtlasBuildInput> {
  const o: Partial<AtlasBuildInput> = {};
  if (!p || typeof p !== "object") return o;
  if (p.program === "kkb" || p.program === "dkb") o.program = p.program;
  if (typeof p.region === "string" && p.region.trim()) o.region = p.region.trim();
  for (const k of ["confidenceMin", "cooldownDays", "maxCampaigns", "explorePct", "urgencyWeight", "budget"] as const) {
    if (p[k] != null && !isNaN(Number(p[k]))) (o as any)[k] = Number(p[k]);
  }
  if (p.urgencyMin != null && !isNaN(Number(p.urgencyMin))) o.urgencyMin = Number(p.urgencyMin);
  return o;
}

function stripNulls(a?: Partial<AtlasBuildInput>): Partial<AtlasBuildInput> {
  const o: any = {};
  for (const [k, v] of Object.entries(a ?? {})) if (v !== undefined && v !== "") o[k] = v;
  return o;
}

export const atlasChat = createServerFn({ method: "POST" }).middleware([atlasSession])
  .inputValidator((d: { messages: ChatMsg[]; advanced?: Partial<AtlasBuildInput>; lastCohort?: string | null }) => d)
  .handler(async ({ data }): Promise<any> => {
    const actor = await requireAtlasActor();
    const msgs = (data.messages ?? []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string");
    const last = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
    const doBuild = async (params: Partial<AtlasBuildInput>, lead: string) => {
      const ctl = await getControl();
      if (ctl.killed) return { action: "answer", reply: "I'm halted right now — the kill switch is on. Resume me and I'll put a cohort together." };
      const usedParams = { ...CHAT_DEFAULTS, ...stripNulls(data.advanced), ...params } as AtlasBuildInput;
      const cohort = await buildCohortCore(actor, usedParams);
      return { action: "build", reply: `${lead}\n\n${cohort.narration}`.trim(), cohort, usedParams };
    };

    let parsed: any = null;
    try { parsed = parseJson(await callGateway(msgs, data.lastCohort ?? null)); }
    catch (e) { console.error("atlasChat gateway:", (e as Error).message); }

    if (!parsed || !["build", "clarify", "answer"].includes(parsed.action)) {
      if (/cohort|today|call/i.test(last)) return doBuild({}, "My language model isn't reachable right now, so I've used the standard settings.");
      return { action: "answer", reply: "I couldn't quite follow that just now. Could you rephrase — for example, \"Give me today's cohort\"?" };
    }
    const message = String(parsed.message ?? "").trim();
    if (parsed.action === "build") return doBuild(cleanParams(parsed.params), message);
    return { action: parsed.action, reply: message || "Could you say a bit more about what you need?" };
  });

export const atlasListCohorts = createServerFn({ method: "POST" }).middleware([atlasSession]).handler(async () => {
  await requireAtlasActor();
  const { data, error } = await stateDb().from("atlas_cohorts")
    .select("id, created_at, program, region, total_count, status, model_mark")
    .order("created_at", { ascending: false }).limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []) as any[];
});

export const atlasGetCohort = createServerFn({ method: "POST" }).middleware([atlasSession])
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

export const atlasGetControl = createServerFn({ method: "POST" }).middleware([atlasSession]).handler(async () => {
  await requireAtlasActor();
  return getControl();
});

export const atlasSetControl = createServerFn({ method: "POST" }).middleware([atlasSession])
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

export const atlasApproveCohort = createServerFn({ method: "POST" }).middleware([atlasSession])
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

export const atlasCancelCohort = createServerFn({ method: "POST" }).middleware([atlasSession])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireAtlasActor();
    const { error } = await stateDb().from("atlas_cohorts").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

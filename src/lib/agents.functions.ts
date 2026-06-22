import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { type ProgramId } from "@/programs/registry";

export interface ProgramAgent {
  id: string;
  program: ProgramId;
  agent_id: string;
  name: string;
  status: string;
  last_error: string | null;
  created_at: string;
}

function sb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

const RAYA_BASE = "https://v1.getraya.app/api";

async function rayaGetAgent(agentId: string): Promise<{ ok: true; name: string; raw: any } | { ok: false; error: string }> {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) return { ok: false, error: "RAYA_API_KEY is not set. Add it in Project Settings → Secrets." };
  try {
    const res = await fetch(`${RAYA_BASE}/agent/${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    if (!res.ok) {
      let msg = `Raya API ${res.status}`;
      if (res.status === 401) msg = "Raya rejected the API key (401). Check RAYA_API_KEY.";
      else if (res.status === 404) msg = `Agent not found (404): ${agentId}`;
      else if (parsed && typeof parsed === "object") {
        const m = parsed.message || parsed.error || parsed.detail;
        if (typeof m === "string") msg = `Raya API ${res.status}: ${m}`;
      }
      return { ok: false, error: msg };
    }
    const a = (parsed?.agent ?? parsed?.data ?? parsed) as any;
    const name = String(a?.name ?? a?.agent_name ?? a?.title ?? "Unnamed agent");
    return { ok: true, name, raw: a };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export const loadAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { agentId: string }) => {
    if (!d.agentId?.trim()) throw new Error("agentId required");
    return d;
  })
  .handler(async ({ data }) => rayaGetAgent(data.agentId.trim()));

export const listProgramAgents = createServerFn({ method: "GET" })
  .inputValidator((d: { program?: ProgramId }) => d)
  .handler(async ({ data }) => {
    const c = sb();
    let q = c.from("program_agents").select("*").order("created_at", { ascending: true });
    if (data.program) q = q.eq("program", data.program);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ProgramAgent[];
  });

export const createProgramAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId; agentId: string; name?: string }) => {
    if (!d.program) throw new Error("program required");
    if (!d.agentId?.trim()) throw new Error("agentId required");
    return d;
  })
  .handler(async ({ data }) => {
    const fetched = await rayaGetAgent(data.agentId.trim());
    const status = fetched.ok ? "loaded" : "error";
    const last_error = fetched.ok ? null : fetched.error;
    const name = (data.name?.trim()) || (fetched.ok ? fetched.name : data.agentId.trim());

    const c = sb();
    const { data: row, error } = await c
      .from("program_agents")
      .upsert(
        {
          program: data.program,
          agent_id: data.agentId.trim(),
          name,
          status,
          last_error,
        },
        { onConflict: "program,agent_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: fetched.ok, row: row as ProgramAgent, error: fetched.ok ? null : fetched.error };
  });

export const refreshProgramAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const c = sb();
    const { data: existing, error: e1 } = await c
      .from("program_agents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1) throw new Error(e1.message);
    const row = existing as ProgramAgent;
    const fetched = await rayaGetAgent(row.agent_id);
    const patch = fetched.ok
      ? { status: "loaded", last_error: null, name: row.name || fetched.name }
      : { status: "error", last_error: fetched.error };
    const { data: updated, error } = await c
      .from("program_agents")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { ok: fetched.ok, row: updated as ProgramAgent, error: fetched.ok ? null : fetched.error };
  });

export const deleteProgramAgent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const c = sb();
    const { error } = await c.from("program_agents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

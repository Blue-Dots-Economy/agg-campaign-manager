import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface NorthStarConfigRow {
  key: string;
  threshold: number | null;
  enabled: boolean;
  sort: number;
}

export const fetchNorthStar = createServerFn({ method: "GET" })
  .inputValidator((d: { program: string }) => d)
  .handler(async ({ data }): Promise<NorthStarConfigRow[]> => {
    try {
      const client = sb();
      const { data: rows, error } = await client
        .from("north_star_config")
        .select("key, threshold, enabled, sort")
        .eq("program", data.program)
        .order("sort", { ascending: true });
      if (error) throw new Error(error.message);
      return (rows ?? []).map((r: Record<string, unknown>) => ({
        key: String(r.key),
        threshold: r.threshold == null ? null : Number(r.threshold),
        enabled: r.enabled !== false,
        sort: Number(r.sort) || 0,
      }));
    } catch {
      return [];
    }
  });

export const saveNorthStar = createServerFn({ method: "POST" })
  .inputValidator((d: { program: string; key: string; threshold: number | null; enabled?: boolean }) => d)
  .handler(async ({ data }) => {
    const client = sb();
    const { error } = await client.from("north_star_config").upsert(
      {
        program: data.program,
        key: data.key,
        threshold: data.threshold,
        enabled: data.enabled ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "program,key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

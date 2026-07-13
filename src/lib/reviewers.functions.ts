import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

function sb() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
const ADMIN_EMAIL = "admin@bluedots.com";
const ADMIN_PASSWORD = "456789";

export const resolveLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password?: string }) => d)
  .handler(async ({ data }): Promise<{ role: "admin" | "user" | null }> => {
    const email = (data.email || "").trim().toLowerCase();
    const password = data.password || "";
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) return { role: "admin" };
    try {
      const { data: row } = await sb().from("reviewers").select("email").eq("email", email).maybeSingle();
      if (row) return { role: "user" };
    } catch { /* ignore */ }
    return { role: null };
  });

export const listReviewers = createServerFn({ method: "GET" })
  .handler(async (): Promise<string[]> => {
    try {
      const { data } = await sb().from("reviewers").select("email").order("email");
      return (data ?? []).map((r: { email: string }) => r.email);
    } catch { return []; }
  });

export const addReviewer = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return { ok: false };
    try { await sb().from("reviewers").upsert({ email }, { onConflict: "email" }); return { ok: true }; }
    catch { return { ok: false }; }
  });

export const removeReviewer = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    try { await sb().from("reviewers").delete().eq("email", email); return { ok: true }; }
    catch { return { ok: false }; }
  });

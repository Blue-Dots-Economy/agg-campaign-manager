// Server-only. Per-actor Supabase project selection. Default = CURRENT project (fail-safe).
// Never import this from client code; never use it on auth/login paths.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

const SWITCH_EMAILS = new Set(["vineela@bluedots.com"]);
const AUTH_COOKIE = "rozgar_auth";
const OPTS = { auth: { persistSession: false, autoRefreshToken: false } } as const;

function currentClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, OPTS);
}
function secondClient(): SupabaseClient | null {
  const url = process.env.NEW_SUPABASE_URL;
  const key = process.env.NEW_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, OPTS);
}
function actorEmail(): string | null {
  try {
    const cookie = getRequest()?.headers?.get("cookie");
    if (!cookie) return null;
    const m = cookie.split("; ").find((c) => c.startsWith(AUTH_COOKIE + "="));
    if (!m) return null;
    const raw = decodeURIComponent(m.split("=").slice(1).join("="));
    const email = String(JSON.parse(raw)?.email ?? "").trim().toLowerCase();
    return email || null;
  } catch { return null; }
}
/** True only when the current actor is a pilot user AND the second project's env vars are present. */
export function usesSecondProject(): boolean {
  try {
    const email = actorEmail();
    return !!(email && SWITCH_EMAILS.has(email) && process.env.NEW_SUPABASE_URL && process.env.NEW_SUPABASE_SERVICE_ROLE_KEY);
  } catch { return false; }
}
/** Admin Supabase client for the current actor. Default = CURRENT project. */
export function sbFor(): SupabaseClient {
  try {
    if (usesSecondProject()) {
      const second = secondClient();
      if (second) return second;
    }
  } catch { /* fall through to current */ }
  return currentClient();
}

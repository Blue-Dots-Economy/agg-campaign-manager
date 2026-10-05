// Zeffy API client + webhook token verification.
// Read endpoints are documented; contact/tag writes are attempted and degrade gracefully.
import { timingSafeEqual } from "crypto";

const ZEFFY_API_BASE = "https://api.zeffy.com/api/v1";

export function zeffyConfigured(): boolean {
  return Boolean(process.env["ZEFFY_API_KEY"]);
}

function zeffyHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env["ZEFFY_API_KEY"]!}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function zeffyFetch(
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${ZEFFY_API_BASE}${path}`, {
      ...init,
      headers: { ...zeffyHeaders(), ...(init?.headers ?? {}) },
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (error) {
    return { ok: false, status: 0, data: String(error instanceof Error ? error.message : error) };
  }
}

export async function zeffyGetPayment(paymentId: string) {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  return zeffyFetch(`/payments/${encodeURIComponent(paymentId)}`);
}

export async function zeffyListPayments(query = "") {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  return zeffyFetch(`/payments${query ? `?${query}` : ""}`);
}

export async function zeffyFindContactByEmail(email: string) {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  return zeffyFetch(`/contacts?email=${encodeURIComponent(email)}`);
}

export async function zeffyCreateContact(contact: {
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  street?: string;
  city?: string;
  postal?: string;
  country?: string;
  source?: string;
}) {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  return zeffyFetch("/contacts", { method: "POST", body: JSON.stringify(contact) });
}

export async function zeffyUpdateContact(contactId: string, patch: Record<string, unknown>) {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  return zeffyFetch(`/contacts/${encodeURIComponent(contactId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function zeffyListTaxonomies() {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  return zeffyFetch("/taxonomies");
}

export async function zeffyTagContact(contactId: string, taxonomyName: string) {
  if (!zeffyConfigured()) return { ok: false, status: 0, data: { reason: "no_api_key" } };
  // Attempt the write; if Zeffy's write surface differs, the failure is logged by the caller.
  return zeffyFetch(`/contacts/${encodeURIComponent(contactId)}/tags`, {
    method: "POST",
    body: JSON.stringify({ name: taxonomyName }),
  });
}

export function verifyZeffyWebhookToken(token: string | null | undefined): boolean {
  const expected = process.env["ZEFFY_WEBHOOK_TOKEN"];
  if (!token || !expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

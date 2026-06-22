// Server-side Raya Voice AI client. RAYA_API_KEY is read from process.env
// inside .handler() and never sent to the browser.

import { createServerFn } from "@tanstack/react-start";

const BASE_URL = "https://v1.getraya.app/api";

export interface RayaContact {
  contact_name: string;
  contact_phone: string;
  country_code: string;
  [extra: string]: unknown;
}

export interface RayaSchedule {
  timezone: string; // IANA, e.g. "Asia/Kolkata"
  start_time: string; // "HH:mm"
  end_time: string; // "HH:mm"
  days: number[]; // 1=Mon … 7=Sun
}

class RayaApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function rayaFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<unknown> {
  const apiKey = process.env.RAYA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "RAYA_API_KEY is not set. Add it in Project Settings → Secrets, then try again.",
    );
  }

  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  let body = init.body;
  if (init.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }

  if (!res.ok) {
    let msg = `Raya API ${res.status}`;
    if (res.status === 401) msg = "Raya rejected the API key (401). Check RAYA_API_KEY.";
    else if (res.status === 429)
      msg = "Raya rate limit hit (429). Default is 1 call per 20s — slow down and retry.";
    else if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      const m =
        (typeof p.message === "string" && p.message) ||
        (typeof p.error === "string" && p.error) ||
        (typeof p.detail === "string" && p.detail) ||
        null;
      if (m) msg = `Raya API ${res.status}: ${m}`;
    }
    throw new RayaApiError(res.status, parsed, msg);
  }
  return parsed;
}

// ---------- createBatch ----------
export const rayaCreateBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { agentId: string; batchName: string; contacts: RayaContact[] }) => {
      if (!data.agentId) throw new Error("Missing agent id for this program. Set it in Settings.");
      if (!data.batchName) throw new Error("Missing batch name.");
      if (!Array.isArray(data.contacts) || data.contacts.length === 0)
        throw new Error("No contacts to send.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body = {
      agent_id: data.agentId,
      batch_name: data.batchName,
      contacts: data.contacts,
    };
    const res = await rayaFetch("/batch", { method: "POST", json: body });
    return res as { id?: string; batch_id?: string; [k: string]: unknown };
  });

// ---------- startBatch ----------
export const rayaStartBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      batchId: string;
      schedule?: RayaSchedule;
      maxRetries?: number;
      selectedStatuses?: string[];
    }) => {
      if (!data.batchId) throw new Error("Missing batch id.");
      if (data.schedule) {
        const s = data.schedule;
        if (!s.start_time || !s.end_time) throw new Error("Schedule requires start_time and end_time.");
        if (s.start_time >= s.end_time) throw new Error("end_time must be after start_time.");
        if (!Array.isArray(s.days) || s.days.length === 0)
          throw new Error("Pick at least one day of the week.");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body: Record<string, unknown> = {};
    if (data.schedule) body.schedule = data.schedule;
    if (typeof data.maxRetries === "number") body.max_retries = data.maxRetries;
    if (data.selectedStatuses && data.selectedStatuses.length)
      body.selected_statuses = data.selectedStatuses;
    return (await rayaFetch(`/batch/${encodeURIComponent(data.batchId)}/start`, {
      method: "POST",
      json: body,
    })) as Record<string, unknown>;
  });

// ---------- updateBatch ----------
export const rayaUpdateBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      batchId: string;
      name?: string;
      schedule?: RayaSchedule;
      maxRetries?: number;
      retryAfterHrs?: number;
      concurrency?: number;
    }) => {
      if (!data.batchId) throw new Error("Missing batch id.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body: Record<string, unknown> = {};
    if (data.name) body.name = data.name;
    if (data.schedule) body.schedule = data.schedule;
    if (typeof data.maxRetries === "number") body.max_retries = data.maxRetries;
    if (typeof data.retryAfterHrs === "number") body.retry_after_hrs = data.retryAfterHrs;
    if (typeof data.concurrency === "number") body.concurrency = data.concurrency;
    return (await rayaFetch(`/batch/${encodeURIComponent(data.batchId)}`, {
      method: "PATCH",
      json: body,
    })) as Record<string, unknown>;
  });

// ---------- stopBatch ----------
export const rayaStopBatch = createServerFn({ method: "POST" })
  .inputValidator((data: { batchId: string }) => {
    if (!data.batchId) throw new Error("Missing batch id.");
    return data;
  })
  .handler(async ({ data }) => {
    return (await rayaFetch(`/batch/${encodeURIComponent(data.batchId)}/stop`, {
      method: "POST",
      json: {},
    })) as Record<string, unknown>;
  });

// ---------- listBatches ----------
export const rayaListBatches = createServerFn({ method: "GET" })
  .inputValidator((data: { agentId?: string; page?: number; pageSize?: number }) => data)
  .handler(async ({ data }) => {
    const qs = new URLSearchParams();
    if (data.agentId) qs.set("agent_id", data.agentId);
    if (data.page) qs.set("page", String(data.page));
    if (data.pageSize) qs.set("page_size", String(data.pageSize));
    const q = qs.toString();
    const res = await rayaFetch(`/batch${q ? `?${q}` : ""}`, { method: "GET" });
    return res as { items?: unknown[]; data?: unknown[]; [k: string]: unknown };
  });

// ---------- getBatchContacts ----------
export const rayaGetBatchContacts = createServerFn({ method: "GET" })
  .inputValidator((data: { batchId: string; page?: number; pageSize?: number }) => {
    if (!data.batchId) throw new Error("Missing batch id.");
    return data;
  })
  .handler(async ({ data }) => {
    const qs = new URLSearchParams();
    if (data.page) qs.set("page", String(data.page));
    if (data.pageSize) qs.set("page_size", String(data.pageSize));
    const q = qs.toString();
    return (await rayaFetch(
      `/batch/${encodeURIComponent(data.batchId)}/contacts${q ? `?${q}` : ""}`,
      { method: "GET" },
    )) as Record<string, unknown>;
  });

// ---------- initiateCall ----------
export const rayaInitiateCall = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      agentId: string;
      toNumber: string;
      countryCode?: string;
      agentArgs?: Record<string, unknown>;
    }) => {
      if (!data.agentId) throw new Error("Missing agent id.");
      if (!data.toNumber) throw new Error("Missing phone number.");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const body = {
      agent_id: data.agentId,
      to_number: data.toNumber,
      country_code: data.countryCode ?? "91",
      agent_args: data.agentArgs ?? {},
    };
    return (await rayaFetch("/call", { method: "POST", json: body })) as Record<string, unknown>;
  });

// ---------- key status (does not expose the key) ----------
export const rayaKeyStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: Boolean(process.env.RAYA_API_KEY) };
});

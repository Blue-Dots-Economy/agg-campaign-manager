// Donation intake + Zeffy webhook processing for the Sapijodzi flow.
// Submissions are written with service role (public form; tables are server-only).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  zeffyFindContactByEmail,
  zeffyCreateContact,
  zeffyUpdateContact,
  zeffyGetPayment,
  zeffyTagContact,
  verifyZeffyWebhookToken,
  zeffyConfigured,
} from "@/lib/zeffy.server";
import { sendEmail, escapeHtml, senderAddress } from "@/lib/email.server";

type AnyJson = string | number | boolean | null | AnyJson[] | { [k: string]: AnyJson };

const FULL_FEE = 2500;
const MONTHLY = 250;

const submissionSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  street: z.string().trim().max(200).optional().or(z.literal("")),
  postal: z.string().trim().max(20).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  country: z.string().trim().max(80).optional().or(z.literal("")),
  plan: z.enum(["full_fee", "monthly", "other"]),
  paysTowards: z.string().trim().max(500).optional().or(z.literal("")),
  comment: z.string().trim().max(2000).optional().or(z.literal("")),
  paymentMethod: z.enum(["swish", "swish_card"]).optional(),
});

export const createDonationSubmission = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submissionSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inserted, error } = await supabaseAdmin
      .from("donation_submissions")
      .insert({
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.email.toLowerCase(),
        phone: data.phone || null,
        street: data.street || null,
        postal: data.postal || null,
        city: data.city || null,
        country: data.country || "Sverige",
        plan: data.plan,
        pays_towards: data.paysTowards || null,
        comment: data.comment || null,
        payment_method: data.paymentMethod ?? null,
        amount_sek: data.plan === "full_fee" ? FULL_FEE : data.plan === "monthly" ? MONTHLY : null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return { ok: false as const, error: "Kunde inte spara din ansökan. Försök igen." };
    }

    await supabaseAdmin.from("donation_events").insert({
      submission_id: inserted.id,
      type: "submission_created",
      detail: { plan: data.plan, payment_method: data.paymentMethod ?? null },
    });

    // Choose the Zeffy form. One shared form is fine until the monthly duplicate exists.
    const formUrl =
      data.plan === "monthly"
        ? process.env["ZEFFY_FORM_MONTHLY_URL"] ?? process.env["ZEFFY_FORM_ONETIME_URL"] ?? null
        : process.env["ZEFFY_FORM_ONETIME_URL"] ?? null;
    if (!formUrl) {
      return { ok: false as const, error: "Betalformuläret är inte konfigurerat ännu." };
    }

    const params = new URLSearchParams();
    if (data.plan === "full_fee") params.set("Amount", String(FULL_FEE));
    if (data.plan === "monthly") params.set("Amount", String(MONTHLY));
    params.set("firstname", data.firstName);
    params.set("lastname", data.lastName);
    params.set("email", data.email);
    if (data.street) params.set("street", data.street);
    if (data.city) params.set("city", data.city);
    if (data.postal) params.set("postal", data.postal);

    const redirectUrl = `${formUrl}${formUrl.includes("?") ? "&" : "?"}${params.toString()}`;
    return { ok: true as const, redirectUrl };
  });

// ---------------- Webhook processing ----------------

type ZeffyPayment = {
  id?: string | number;
  amount?: number;
  type?: string;
  campaign?: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  buyer?: {
    email?: string;
    firstname?: string;
    lastname?: string;
    street?: string;
    city?: string;
    postal?: string;
    phone?: string;
  };
};

function extractPayment(payload: Record<string, unknown>): ZeffyPayment {
  const data = (payload.data ?? payload) as Record<string, unknown>;
  return data as ZeffyPayment;
}

function toCsv(row: Record<string, string | number | null | undefined>): string {
  const header = [
    "Datum", "Förnamn", "Efternamn", "E-post", "Telefon", "Adress", "Postnummer", "Stad", "Land",
    "Betaltyp", "Belopp SEK", "Vad det betalas för", "Betalmetod", "Kommentar",
    "Zeffy betalnings-id", "Zeffy kontakt-id", "Kvitto",
  ];
  const values = [
    row.date, row.firstname, row.lastname, row.email, row.phone, row.street, row.postal, row.city,
    row.country, row.plan, row.amount, row.pays_towards, row.payment_method, row.comment,
    row.payment_id, row.contact_id, row.receipt,
  ];
  const cell = (v: string | number | null | undefined) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${header.join(";")}\n${values.map(cell).join(";")}`;
}

function tagNamesFor(plan: string): string[] {
  const base = ["Donor 2026", "Donation 2026"];
  if (plan === "full_fee") base.push("Student fee 2500");
  if (plan === "monthly") base.push("Monthly donor", "donor-monthly");
  return base;
}

async function logEvent(
  supabaseAdmin: { from: (t: string) => any },
  submissionId: string | null,
  type: string,
  detail: Record<string, AnyJson>,
) {
  await supabaseAdmin.from("donation_events").insert({ submission_id: submissionId, type, detail });
}

export const processZeffyWebhook = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const parsed = z.object({ token: z.string(), payload: z.record(z.string(), z.any()) }).parse(input);
    return parsed;
  })
  .handler(async ({ data }) => {
    if (!verifyZeffyWebhookToken(data.token)) {
      return { ok: false as const, status: 401, error: "Invalid token" };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payment = extractPayment(data.payload as Record<string, unknown>);
    const email = (payment.buyer?.email ?? payment.email ?? "").toLowerCase().trim();
    const eventType = String(data.payload["event"] ?? data.payload["type"] ?? "payment.completed");

    if (!eventType.toLowerCase().includes("payment")) {
      await logEvent(supabaseAdmin, null, "webhook_ignored", { event: eventType });
      return { ok: true as const, ignored: true };
    }

    // Match the paid submission: pending row for that email, else a previously seen payment id.
    let matched: { id: string; plan: string; email: string } | null = null;
    if (email) {
      const { data: rows } = await supabaseAdmin
        .from("donation_submissions")
        .select("id, plan, email")
        .eq("email", email)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      matched = rows?.[0] ?? null;
    }
    const paymentId = payment.id != null ? String(payment.id) : null;
    if (!matched && paymentId) {
      const { data: rows } = await supabaseAdmin
        .from("donation_submissions")
        .select("id, plan, email")
        .eq("zeffy_payment_id", paymentId)
        .limit(1);
      matched = rows?.[0] ?? null;
    }

    if (!matched) {
      await logEvent(supabaseAdmin, null, "webhook_unmatched", { email, payment_id: paymentId });
      return { ok: true as const, matched: false };
    }

    const buyer = payment.buyer ?? {};
    const amount = typeof payment.amount === "number" ? payment.amount : null;
    const plan = matched.plan;
    const tagNames = tagNamesFor(plan);

    // Zeffy API enrichment — every step degrades gracefully and is logged.
    const zeffy: Record<string, AnyJson> = {};
    if (zeffyConfigured()) {
      if (paymentId) {
        const detail = await zeffyGetPayment(paymentId);
        zeffy["payment_lookup"] = { ok: detail.ok, status: detail.status };
      }
      let contactId: string | null = null;
      const existing = email ? await zeffyFindContactByEmail(email) : { ok: false, status: 0, data: null as any };
      if (existing.ok) {
        const list = (existing.data as { data?: Array<{ id?: string | number }> })?.data;
        contactId = list?.[0]?.id != null ? String(list[0].id) : null;
        zeffy["contact_lookup"] = { ok: true, found: Boolean(contactId) };
      } else {
        zeffy["contact_lookup"] = { ok: false, status: existing.status };
      }
      const contactPayload = {
        email,
        firstname: buyer.firstname ?? "",
        lastname: buyer.lastname ?? "",
        phone: buyer.phone ?? "",
        street: buyer.street ?? "",
        city: buyer.city ?? "",
        postal: buyer.postal ?? "",
        source: "Sapijodzi donation form",
      };
      if (contactId) {
        const updated = await zeffyUpdateContact(contactId, contactPayload);
        zeffy["contact_update"] = { ok: updated.ok, status: updated.status };
      } else {
        const created = await zeffyCreateContact(contactPayload as Parameters<typeof zeffyCreateContact>[0]);
        const createdId = (created.data as { id?: string | number })?.id;
        contactId = createdId != null ? String(createdId) : null;
        zeffy["contact_create"] = { ok: created.ok, status: created.status, id: contactId };
      }
      const tagResults: Record<string, unknown> = {};
      if (contactId) {
        for (const tag of tagNames) {
          const res = await zeffyTagContact(contactId, tag);
          tagResults[tag] = { ok: res.ok, status: res.status };
        }
      }
      zeffy["tags"] = tagResults;
      await supabaseAdmin
        .from("donation_submissions")
        .update({
          zeffy_payment_id: paymentId,
          ...(contactId ? { zeffy_contact_id: contactId } : {}),
          zeffy_tags: { requested: tagNames, results: tagResults },
        })
        .eq("id", matched.id);
    } else {
      zeffy["skipped"] = "no_api_key";
      await supabaseAdmin
        .from("donation_submissions")
        .update({ zeffy_payment_id: paymentId })
        .eq("id", matched.id);
    }

    // CSV for Agnes' bookkeeping + Resend delivery.
    const { data: full } = await supabaseAdmin
      .from("donation_submissions")
      .select("*")
      .eq("id", matched.id)
      .single();
    const csv = toCsv({
      date: new Date().toISOString().slice(0, 10),
      firstname: full?.first_name,
      lastname: full?.last_name,
      email: full?.email,
      phone: full?.phone,
      street: full?.street,
      postal: full?.postal,
      city: full?.city,
      country: full?.country,
      plan: plan === "full_fee" ? "Engång (helår)" : plan === "monthly" ? "Månadsvis" : "Annat",
      amount: full?.amount_sek,
      pays_towards: full?.pays_towards,
      payment_method: full?.payment_method === "swish_card" ? "Swish-kort (Apple Pay/Google Pay)" : "Swish",
      comment: full?.comment,
      payment_id: paymentId,
      contact_id: full?.zeffy_contact_id ?? null,
      receipt: plan === "full_fee" ? "Ja (Zeffy automatiskt)" : "Enligt formulär",
    });
    await supabaseAdmin.from("donation_submissions").update({ csv_content: csv }).eq("id", matched.id);

    const emailResult = await sendEmail({
      to: "agatha@stockholmskonomi.se",
      subject: `Donation Sapijodzi — ${full?.first_name} ${full?.last_name}`,
      html: `<p>Hej Agnes,</p><p>En ny donation kom in via Zeffy. CSV-filen är bifogad för import.</p>
<p>${escapeHtml(full?.first_name ?? "")} ${escapeHtml(full?.last_name ?? "")} — ${escapeHtml(String(full?.amount_sek ?? ""))} kr (${escapeHtml(plan)})</p>`,
      attachments: [{ filename: `sapijodzi-donation-${paymentId ?? matched.id}.csv`, content: Buffer.from(csv).toString("base64") }],
    });
    await supabaseAdmin
      .from("donation_submissions")
      .update({
        status: "paid",
        email_status: emailResult.ok ? "csv_sent" : emailResult.skipped ? "csv_saved_no_resend" : "csv_failed",
      })
      .eq("id", matched.id);
    await logEvent(supabaseAdmin, matched.id, "donation_processed", {
      payment_id: paymentId,
      email_to: "agatha@stockholmskonomi.se",
      sender: senderAddress(),
      email: emailResult,
      zeffy,
    });

    return { ok: true as const, matched: true, submissionId: matched.id, zeffy };
  });

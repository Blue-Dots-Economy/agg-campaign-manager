// Resend email sender (direct API with RESEND_API_KEY). Used for the bookkeeping CSV to Agnes
// and as an onboarding fallback when Zeffy's own thank-you templates are not configured yet.

export function emailConfigured(): boolean {
  return Boolean(process.env["RESEND_API_KEY"]);
}

export function senderAddress(): string {
  return process.env["DONATION_SENDER_EMAIL"] ?? "hej@sapijodzi.org";
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<SendEmailResult> {
  if (!emailConfigured()) {
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["RESEND_API_KEY"]!}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: senderAddress(),
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `resend ${res.status}: ${body.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error instanceof Error ? error.message : error) };
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

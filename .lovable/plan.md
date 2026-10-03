# Sapijodzi — Donation form + Zeffy automation

## What we're building

A public donation page in this app at **`/donera`** (assumes Swedish copy — see questions) that
collects donor details, then hands off to Zeffy's checkout with everything prefilled. A webhook
closes the loop after payment.

### Donation page (public route `/donera`)

Matches the app's existing design language (teal fintech tokens, aurora background, cards) but is a
standalone public page with no dashboard chrome.

Form fields: first name, last name, email, phone, address (street, postal code, city, country),
comment. Payment options:
- **One-time full fee — 2 500 kr** (full year, tax-deductible)
- **Monthly — 250 kr × 10 months**
- **Other** → shows "What are you paying towards?" text field; donor picks/adjusts the amount on
  Zeffy (the page shows the standard amounts 2 500 / 250)
- Payment-method note: Swish (standard) or Swish card (Apple Pay / Google Pay) — recorded and
  included in the CSV; the actual payment method is chosen in Zeffy's checkout.

On submit: the submission is stored in the database, then the browser is redirected to the
matching Zeffy donation form URL with query params: `Amount`, `firstname`, `lastname`, `email`,
`street`, `city`, `postal` (Zeffy's supported prefill params).

### After payment (webhook)

New public route `POST /api/public/hooks/zeffy-webhook?token=…`:
1. Verify the token (constant-time compare) against the `ZEFFY_WEBHOOK_TOKEN` secret.
2. Parse `payment.completed` payload (buyer name, email, address, amount, payment id, campaign,
   one-time vs monthly) and match it to the stored submission by email (fallback: latest pending
   submission for that email). Mark the submission paid.
3. Via the Zeffy API (read endpoints are confirmed; writes are attempted and degrade gracefully):
   - fetch the payment record (`GET /payments`) to double-check amount/id when the API key exists,
   - create/update the contact (`POST /contacts`, source = the Zeffy donation),
   - add taxonomy tags where the API allows: `Donor 2026`, `Donation 2026`, plus `Student fee 2500`
     / `Student fee 3750`-style tags for full-fee payments or `Monthly donor` (`donor-monthly`)
     for monthly — untagged actions are logged so they can be fixed manually.
4. Tax receipts: Zeffy issues these automatically per form — the full-fee/one-time form will have
   receipts enabled (set in the Zeffy dashboard; noted in setup steps).
5. Build the CSV import file (date, donor name, email, address, amount, currency, payment id,
   one-time/monthly, what they paid towards, payment method, Zeffy ids) and email it to
   **agatha@stockholmskonomi.se** via Resend (`RESEND_API_KEY` secret).
6. Onboarding email to the donor: Zeffy's per-form thank-you email templates handle this ("Onboarding:
   Full year 2026" on the one-time form, "Onboarding: Monthly" on the monthly form — configured in
   the Zeffy dashboard). We record which template applied per donation in the log.

### Database (this project)

`donation_submissions`: id, created_at, session token, first/last name, email, phone, street,
postal, city, country, plan (full_fee | monthly | other), pays_towards, comment, payment_method,
amount_sek, status (pending | paid | failed | unknown), zeffy_payment_id, zeffy_contact_id,
zeffy_tags jsonb, webhook payload jsonb, error. No public RLS access — service-role/server only.
A `donation_events` log table records each webhook/step outcome for debugging.

## Files

- NEW `src/routes/donera.tsx` — donation form page
- NEW `src/lib/donations.functions.ts` — server fns: create submission + return redirect URL,
  webhook-side helpers (match, tag attempt, CSV build, emails)
- NEW `src/lib/zeffy.server.ts` — Zeffy API client + webhook token verify
- NEW `src/lib/email.server.ts` — Resend client (CSV with attachment + onboarding fallback email)
- NEW `src/routes/api.public/hooks.zeffy-webhook.ts` — webhook route (real path `/api/public/hooks/zeffy-webhook`)
- EDIT `src/routes/__root.tsx` — add `/donera` to the public paths
- NEW migration SQL + applied via the database tool (table + grants)

## Secrets & configuration (Project Settings → Secrets)

- `ZEFFY_API_KEY` — you paste it (you're grabbing it)
- `ZEFFY_WEBHOOK_TOKEN` — I'll generate a random one and give it to you to paste into the Zeffy
  webhook configuration
- `RESEND_API_KEY` — needed for the CSV email to Agnes and as onboarding fallback; sending to an
  external address requires a verified sender domain in Resend
- Zeffy form URLs for one-time and monthly forms — configured as secrets (`ZEFFY_FORM_ONETIME_URL`,
  `ZEFFY_FORM_MONTHLY_URL`, `ZEFFY_FORM_OTHER_URL` optional)

## Questions before I build

1. **Language** — Swedish, English, or both (toggle) on the donation page?
2. **Zeffy form URL(s)** — paste the donation form link(s). If you only have one form today, I'll
   wire both payment types to it and you duplicate it in Zeffy later for the monthly onboarding
   email.
3. **Sender for the emails to Agnes + donors** — which address (e.g. `hej@sapijodzi.org`)? It must
   be on a domain verified in Resend.
4. Confirm `/donera` is the right slug (or tell me the one you want).

## Explicitly out of scope

Nothing else about the site. Existing dashboard/auth/ATLAS behavior untouched.

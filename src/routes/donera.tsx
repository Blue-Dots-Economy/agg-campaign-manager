import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { createDonationSubmission } from "@/lib/donations.functions";

export const Route = createFileRoute("/donera")({
  head: () => ({
    meta: [
      { title: "Ge en gåva — Sapijodzi" },
      { name: "description", content: "Stöd Sapijodzi med en engångsgåva eller månadsvis." },
      { property: "og:title", content: "Ge en gåva — Sapijodzi" },
      { property: "og:description", content: "Stöd Sapijodzi med en engångsgåva eller månadsvis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DonationPage,
});

type Plan = "full_fee" | "monthly" | "other";

const PLANS: Array<{ id: Plan; label: string; hint: string }> = [
  { id: "full_fee", label: "Helår — 2 500 kr", hint: "Engång, heltidsavgift (skattereduktion via Zeffy)." },
  { id: "monthly", label: "Månadsvis — 250 kr", hint: "250 kr × 10 månader." },
  { id: "other", label: "Annat belopp", hint: "Välj belopp på nästa sida." },
];

function DonationPage() {
  const submit = useServerFn(createDonationSubmission);
  const [plan, setPlan] = useState<Plan>("full_fee");
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    street: "", postal: "", city: "", country: "Sverige",
    paysTowards: "", comment: "", paymentMethod: "swish" as "swish" | "swish_card",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await submit({ data: { ...form, plan } });
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      window.location.href = res.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel. Försök igen.");
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-screen w-full bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border border-border bg-card/90 p-8 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Sapijodzi</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Ge en gåva</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Din gåva finansierar studiemedel och jobbmöjligheter. Helårsavgiften är 2 500 kr — månadsvis
            är 250 kr i 10 månader. Betalning sker via Zeffy (Swish, Swish-kort, Apple Pay eller Google Pay).
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Betaltyp</legend>
              <RadioGroup value={plan} onValueChange={(v) => setPlan(v as Plan)} className="gap-2">
                {PLANS.map((p) => (
                  <label
                    key={p.id}
                    htmlFor={`plan-${p.id}`}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/60 p-3 transition-colors hover:border-primary/50"
                  >
                    <RadioGroupItem value={p.id} id={`plan-${p.id}`} className="mt-0.5" />
                    <span>
                      <span className="block text-sm font-medium">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              {plan !== "full_fee" && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <Label htmlFor="paysTowards" className="text-sm font-medium">Vad betalar du för?</Label>
                  <Input id="paysTowards" value={form.paysTowards} onChange={set("paysTowards")} placeholder="T.ex. avgift, material, resa" />
                  <p className="text-xs text-muted-foreground">
                    Månadsbetalning: 250 kr/månad i 10 månader.
                  </p>
                </div>
              )}
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">Förnamn</Label>
                <Input id="firstName" required value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Efternamn</Label>
                <Input id="lastName" required value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-post</Label>
                <Input id="email" required type="email" value={form.email} onChange={set("email")} autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="street">Gatuadress</Label>
                <Input id="street" value={form.street} onChange={set("street")} autoComplete="street-address" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postal">Postnummer</Label>
                <Input id="postal" value={form.postal} onChange={set("postal")} autoComplete="postal-code" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="city">Stad</Label>
                <Input id="city" value={form.city} onChange={set("city")} autoComplete="address-level2" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="country">Land</Label>
                <Input id="country" value={form.country} onChange={set("country")} autoComplete="country-name" />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Betalmetod</Label>
              <RadioGroup
                value={form.paymentMethod}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v as "swish" | "swish_card" }))}
                className="gap-2"
              >
                {[
                  { id: "swish", label: "Swish (standard)" },
                  { id: "swish_card", label: "Swish-kort (Apple Pay / Google Pay)" },
                ].map((m) => (
                  <label
                    key={m.id}
                    htmlFor={`pm-${m.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background/60 p-3 transition-colors hover:border-primary/50"
                  >
                    <RadioGroupItem value={m.id} id={`pm-${m.id}`} />
                    <span className="text-sm">{m.label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="comment">Kommentar (valfritt)</Label>
              <Textarea id="comment" rows={3} value={form.comment} onChange={set("comment")} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Skickar…" : "Gå vidare till betalning"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Skattereduktion för helårsavgiften utfärdas automatiskt av Zeffy.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

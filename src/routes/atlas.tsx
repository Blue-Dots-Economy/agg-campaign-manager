import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUp, ChevronDown, Info, Mic, OctagonX, SlidersHorizontal } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  atlasApproveCohort, atlasCancelCohort, atlasChat, atlasGetControl, atlasSetControl,
} from "@/lib/atlas.functions";
import { cn } from "@/lib/utils";
import { AtlasOrb } from "@/components/atlas/AtlasOrb";
import { CohortConsole } from "@/components/atlas/CohortConsole";

export const Route = createFileRoute("/atlas")({
  head: () => ({
    meta: [
      { title: "ATLAS — Conversational Cohort Planner (Pilot)" },
      { name: "description", content: "Ask ATLAS for today's cohort — a shadow-mode planner that proposes who to call and explains why." },
      { property: "og:title", content: "ATLAS — Conversational Cohort Planner (Pilot)" },
      { property: "og:description", content: "Shadow-mode conversational cohort planner with human review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AtlasPage,
});

type Member = any;
type Cohort = {
  cohortId: string; totalCount: number; sampleCount: number; exploreCount: number; urgentCount: number;
  narration: string; members: Member[]; urgencyAvailable: boolean; confidenceAvailable?: boolean; status?: string;
  fairness: { byRegion: Record<string, number>; byCategory: Record<string, number>; categoryAvailable: boolean; note: string | null };
};
type Msg = { id: string; role: "user" | "assistant"; content: string; cohort?: Cohort; usedParams?: any };

const STORE = "atlas-chat-v1";
const CHIPS = ["Give me today's cohort", "Most urgent in Ghaziabad", "Only high-confidence seekers", "Who haven't we called recently?", "Why these people?"];

// Page-scoped neural palette (does not touch the global theme).
const NEURAL_CSS = `
.atlas-neural{--n-bg:#07080f;--n-surface:#0e1120;--n-border:rgba(148,163,255,.14);--n-text:#e8eaf6;--n-muted:#a3a9c7;--n-accent:#7dd3fc;--n-user:#e8eaf6;--n-user-text:#0b0d18;background:radial-gradient(1200px 600px at 50% -10%,rgba(79,70,229,.18),transparent 60%),var(--n-bg);color:var(--n-text)}
.atlas-fade{animation:atlas-fade .35s ease-out both}
@keyframes atlas-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.atlas-fade{animation:none}}
`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function AtlasPage() {
  const qc = useQueryClient();
  const getControl = useServerFn(atlasGetControl);
  const setControl = useServerFn(atlasSetControl);
  const chat = useServerFn(atlasChat);
  const approve = useServerFn(atlasApproveCohort);
  const cancel = useServerFn(atlasCancelCohort);

  const control = useQuery({ queryKey: ["atlas", "control"], queryFn: () => getControl() });
  const killed = control.data?.killed ?? false;

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [showAdv, setShowAdv] = useState(false);
  const [program, setProgram] = useState<"kkb" | "dkb">("kkb");
  const [region, setRegion] = useState("");
  const [budget, setBudget] = useState(1000);
  const [confidenceMin, setConfidenceMin] = useState(6);
  const [cooldownDays, setCooldownDays] = useState(30);
  const [maxCampaigns, setMaxCampaigns] = useState(3);
  const [explorePct, setExplorePct] = useState(15);
  const [urgencyWeight, setUrgencyWeight] = useState(30);
  const [urgencyMin, setUrgencyMin] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { const s = sessionStorage.getItem(STORE); if (s) setMessages(JSON.parse(s)); } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify(messages)); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const killMut = useMutation({
    mutationFn: (k: boolean) => setControl({ data: { killed: k } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["atlas", "control"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: async (history: Msg[]) => {
      const lastC = [...history].reverse().find((m) => m.cohort)?.cohort;
      const lastCohort = lastC ? JSON.stringify({
        total: lastC.totalCount, exploration: lastC.exploreCount, urgent: lastC.urgentCount,
        fairness: lastC.fairness, narration: lastC.narration,
        topReasons: lastC.members.slice(0, 15).map((m) => `${m.region}: ${m.reason}`),
      }) : null;
      return chat({ data: {
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        lastCohort,
        advanced: {
          program, region: region || null, budget: Math.min(budget, 1000), confidenceMin, cooldownDays,
          maxCampaigns, explorePct, urgencyWeight, urgencyMin: urgencyMin === "" ? null : Number(urgencyMin),
        },
      } }) as Promise<any>;
    },
    onSuccess: (r) => setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: r.reply, cohort: r.cohort, usedParams: r.usedParams }]),
    onError: (e: Error) => setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `Something went wrong on my side: ${e.message}` }]),
    onSettled: () => inputRef.current?.focus(),
  });

  const send = (text: string) => {
    const t = text.trim();
    if (!t || killed || sendMut.isPending) return;
    const next = [...messages, { id: crypto.randomUUID(), role: "user" as const, content: t }];
    setMessages(next);
    setInput("");
    sendMut.mutate(next);
  };

  const setStatus = (id: string, status: string) =>
    setMessages((ms) => ms.map((m) => (m.cohort?.cohortId === id ? { ...m, cohort: { ...m.cohort, status } } : m)));
  const approveMut = useMutation({
    mutationFn: (id: string) => approve({ data: { id } }),
    onSuccess: (r, id) => { toast.success(r.message); setStatus(id, "approved"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => cancel({ data: { id } }),
    onSuccess: (_r, id) => { toast("Cohort cancelled."); setStatus(id, "cancelled"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const empty = messages.length === 0;

  return (
    <TooltipProvider>
      <style>{NEURAL_CSS}</style>
      <div className="atlas-neural -m-4 flex min-h-[calc(100vh-4rem)] flex-col rounded-none sm:-m-6 md:rounded-2xl">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6" style={{ borderColor: "var(--n-border)" }}>
          <div className="flex items-center gap-3">
            <AtlasOrb size={32} active={sendMut.isPending} />
            <div>
              <h1 className="text-base font-semibold tracking-wide">ATLAS</h1>
              <p className="text-xs" style={{ color: "var(--n-muted)" }}>Automated Targeting, Learning &amp; Allocation System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-xs font-medium" style={{ borderColor: "rgba(125,211,252,.45)", color: "var(--n-accent)" }}
              title="Proposes cohorts — places no calls">Shadow mode · no calls</span>
            <button type="button" onClick={() => killMut.mutate(!killed)} disabled={control.isLoading || killMut.isPending} aria-pressed={killed}
              className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-300",
                killed ? "border-red-400/60 bg-red-500/20 text-red-200" : "hover:bg-white/5")}
              style={killed ? undefined : { borderColor: "var(--n-border)", color: "var(--n-muted)" }}>
              <OctagonX className="h-3.5 w-3.5" />{killed ? "Halted — resume" : "Halt ATLAS"}
            </button>
          </div>
        </header>

        {/* Thread */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl py-6">
            {empty ? (
              <div className="flex flex-col items-center pt-10 text-center sm:pt-16">
                <AtlasOrb size={240} active={sendMut.isPending} className="max-w-[70vw] h-auto" />
                <h2 className="mt-10 text-2xl font-medium sm:text-3xl">{greeting()}. I'm ATLAS.</h2>
                <p className="mt-2 text-sm" style={{ color: "var(--n-muted)" }}>Ask me for today's cohort. I propose — you decide.</p>
                <Chips onPick={send} disabled={killed} className="mt-8 justify-center" />
              </div>
            ) : (
              <ol className="space-y-6">
                {messages.map((m) => (
                  <li key={m.id} className="atlas-fade">
                    {m.role === "user" ? (
                      <div className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-sm" style={{ background: "var(--n-user)", color: "var(--n-user-text)" }}>{m.content}</div>
                      </div>
                    ) : (
                      <div className="flex gap-3">
                        <AtlasOrb size={28} className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-4">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
                          {m.cohort && (
                            <CohortConsole c={m.cohort} killed={killed}
                              budget={Number(m.usedParams?.budget ?? 1000)}
                              regionLabel={m.usedParams?.region || "all regions"}
                              onApprove={() => approveMut.mutate(m.cohort!.cohortId)}
                              onCancel={() => cancelMut.mutate(m.cohort!.cohortId)}
                              busy={approveMut.isPending || cancelMut.isPending} />
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
                {sendMut.isPending && (
                  <li className="atlas-fade flex items-center gap-3" aria-live="polite">
                    <AtlasOrb size={28} active />
                    <span className="text-sm" style={{ color: "var(--n-muted)" }}>Thinking it through…</span>
                  </li>
                )}
              </ol>
            )}
            <div ref={endRef} />
          </div>
        </main>

        {/* Composer */}
        <footer className="sticky bottom-0 border-t px-4 pb-4 pt-3 sm:px-6" style={{ borderColor: "var(--n-border)", background: "rgba(7,8,15,.92)", backdropFilter: "blur(8px)" }}>
          <div className="mx-auto w-full max-w-3xl space-y-3">
            {!empty && messages.length < 4 && <Chips onPick={send} disabled={killed} />}
            {killed && <p className="text-xs text-red-200">ATLAS is halted. Resume it from the header to keep going.</p>}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }}
              className="flex items-center gap-2 rounded-2xl border px-2 py-1.5 focus-within:ring-2 focus-within:ring-sky-300/60"
              style={{ borderColor: "var(--n-border)", background: "var(--n-surface)" }}>
              <label htmlFor="atlas-input" className="sr-only">Ask ATLAS</label>
              <input id="atlas-input" ref={inputRef} autoFocus value={input} onChange={(e) => setInput(e.target.value)} disabled={killed}
                placeholder={killed ? "ATLAS is halted" : "Ask ATLAS…"}
                className="h-10 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-[color:var(--n-muted)] disabled:opacity-60" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span><button type="button" disabled aria-label="Voice input (coming soon)" className="flex h-9 w-9 items-center justify-center rounded-full opacity-50" style={{ color: "var(--n-muted)" }}><Mic className="h-4 w-4" /></button></span>
                </TooltipTrigger>
                <TooltipContent>Voice coming soon</TooltipContent>
              </Tooltip>
              <button type="submit" aria-label="Send" disabled={killed || sendMut.isPending || !input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-40"
                style={{ background: "var(--n-user)", color: "var(--n-user-text)" }}>
                <ArrowUp className="h-4 w-4" />
              </button>
            </form>

            <div>
              <button type="button" onClick={() => setShowAdv((v) => !v)} aria-expanded={showAdv}
                className="flex items-center gap-1.5 rounded text-xs outline-none hover:text-[color:var(--n-text)] focus-visible:ring-2 focus-visible:ring-sky-300" style={{ color: "var(--n-muted)" }}>
                <SlidersHorizontal className="h-3.5 w-3.5" />Advanced controls
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAdv && "rotate-180")} />
              </button>
              {showAdv && (
                <div className="atlas-fade mt-3 max-h-[45vh] space-y-4 overflow-y-auto rounded-xl border p-4" style={{ borderColor: "var(--n-border)", background: "var(--n-surface)" }}>
                  <AdvGroup title="Who to call">
                    <Field label="Program">
                      <div className="flex h-9 rounded-md border p-1" style={{ borderColor: "var(--n-border)" }}>
                        {(["kkb", "dkb"] as const).map((p) => (
                          <button key={p} type="button" onClick={() => setProgram(p)} aria-pressed={program === p}
                            className="flex-1 rounded text-xs font-medium uppercase"
                            style={program === p ? { background: "var(--n-user)", color: "var(--n-user-text)" } : { color: "var(--n-muted)" }}>{p}</button>
                        ))}
                      </div>
                    </Field>
                    <Field label="Region"><TextIn value={region} onChange={setRegion} placeholder="All regions" /></Field>
                    <NumIn label="Confidence ≥ (0–10)" value={confidenceMin} onChange={setConfidenceMin} min={0} max={10} step={0.5} />
                    <NumIn label="Cooldown days" value={cooldownDays} onChange={setCooldownDays} min={0} />
                    <NumIn label="Max campaigns run" value={maxCampaigns} onChange={setMaxCampaigns} min={0} />
                    <Field label="Min urgency" hint="Only include seekers matched to a job at or above this urgency (scale −2 to 5). Leave blank to include everyone. Changes who's included.">
                      <TextIn type="number" value={urgencyMin} onChange={setUrgencyMin} placeholder="No filter" />
                    </Field>
                  </AdvGroup>
                  <AdvGroup title="How to prioritise">
                    <NumIn label="Urgency weight" value={urgencyWeight} onChange={setUrgencyWeight} min={0} max={60}
                      hint="How much job urgency lifts a seeker's ranking (0 = ignore). Changes the order, not who's included." />
                    <NumIn label="Exploration %" value={explorePct} onChange={setExplorePct} min={0} max={50} />
                  </AdvGroup>
                  <AdvGroup title="Size">
                    <NumIn label="Budget (max 1000)" value={budget} onChange={(v) => setBudget(Math.min(v, 1000))} min={1} max={1000} />
                  </AdvGroup>
                  <p className="text-xs" style={{ color: "var(--n-muted)" }}>These apply to every cohort I build in chat; anything you say in a message takes precedence.</p>
                </div>
              )}
            </div>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}

function Chips({ onPick, disabled, className }: { onPick: (s: string) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {CHIPS.map((c) => (
        <button key={c} type="button" disabled={disabled} onClick={() => onPick(c)}
          className="rounded-full border px-3 py-1.5 text-xs outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-40"
          style={{ borderColor: "var(--n-border)", color: "var(--n-text)" }}>{c}</button>
      ))}
    </div>
  );
}

function AdvGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium" style={{ color: "var(--n-muted)" }}>{title}</h3>
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 md:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-5 items-center gap-1.5 text-xs font-medium">
        <span>{label}</span>
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={`About ${label}`} className="rounded outline-none focus-visible:ring-2 focus-visible:ring-sky-300" style={{ color: "var(--n-muted)" }}><Info className="h-3.5 w-3.5" /></button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs leading-relaxed">{hint}</TooltipContent>
          </Tooltip>
        )}
      </div>
      {children}
    </div>
  );
}

function TextIn({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder}
      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300 placeholder:text-[color:var(--n-muted)]"
      style={{ borderColor: "var(--n-border)" }} />
  );
}

function NumIn({ label, value, onChange, min, max, step, hint }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input type="number" value={value} min={min} max={max} step={step} aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        style={{ borderColor: "var(--n-border)" }} />
    </Field>
  );
}

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// HUD-style cohort console. Every element encodes real cohort data.
export type ConsoleCohort = {
  cohortId: string; totalCount: number; sampleCount: number; exploreCount: number; urgentCount: number;
  narration: string; members: any[]; urgencyAvailable: boolean; confidenceAvailable?: boolean; status?: string;
  fairness: { byRegion: Record<string, number>; byCategory: Record<string, number>; categoryAvailable: boolean; note: string | null };
};

const PALETTE = ["#67e8f9", "#818cf8", "#fbbf24", "#c4b5fd", "#94a3b8"];
const CSS = `
.cc-arc{transition:stroke-dasharray 1.1s cubic-bezier(.2,.8,.2,1)}
.cc-step{opacity:0;transform:translateX(-6px);animation:cc-in .45s ease-out forwards}
@keyframes cc-in{to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.cc-arc{transition:none}.cc-step{animation:none;opacity:1;transform:none}}
`;

function useReduced() {
  const [r, setR] = useState(false);
  useEffect(() => { setR(window.matchMedia("(prefers-reduced-motion: reduce)").matches); }, []);
  return r;
}
function useCountUp(target: number, reduced: boolean, ms = 1100) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (reduced) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced, ms]);
  return v;
}
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(id); }, []);
  return m;
}

function topN(rec: Record<string, number>, n = 4): Array<[string, number]> {
  const e = Object.entries(rec).sort((a, b) => b[1] - a[1]);
  if (e.length <= n) return e;
  const rest = e.slice(n).reduce((s, [, v]) => s + v, 0);
  return [...e.slice(0, n), ["Other", rest]];
}

export function CohortConsole({ c, budget, regionLabel, killed, busy, onApprove, onCancel }: {
  c: ConsoleCohort; budget: number; regionLabel: string; killed: boolean; busy: boolean;
  onApprove: () => void; onCancel: () => void;
}) {
  const reduced = useReduced();
  const mounted = useMounted() || reduced;
  const count = useCountUp(c.totalCount, reduced);
  const [open, setOpen] = useState(false);
  const status = c.status ?? "proposed";
  const cap = Math.max(1, Math.min(budget || 1000, 1000));

  // Eligible pool: equals totalCount when under budget; when capped, the server's
  // narration states "out of N who qualify". Unknown otherwise — shown as such.
  const m = c.narration.match(/out of (\d+) who qualify/);
  const matched = m ? Number(m[1]) : c.totalCount < cap ? c.totalCount : null;

  const confVals = c.members.map((x) => (x.confidence == null ? null : Number(x.confidence))).filter((x): x is number => x != null);
  const conf: Array<[string, number]> = [
    ["<4", confVals.filter((v) => v < 4).length],
    ["4–6", confVals.filter((v) => v >= 4 && v < 6).length],
    ["6–8", confVals.filter((v) => v >= 6 && v < 8).length],
    ["8–10", confVals.filter((v) => v >= 8).length],
  ];
  const urgVals = c.members.map((x) => (x.urgency == null ? null : Number(x.urgency))).filter((x): x is number => x != null);
  const urg: Array<[string, number]> = [
    ["−2…0", urgVals.filter((v) => v <= 0).length],
    ["1–2", urgVals.filter((v) => v > 0 && v < 3).length],
    ["3–5", urgVals.filter((v) => v >= 3).length],
  ];
  const explore: Array<[string, number]> = [["Core", Math.max(0, c.sampleCount - c.exploreCount)], ["Exploration", c.exploreCount]];

  const R = 70, C = 2 * Math.PI * R, frac = Math.min(1, c.totalCount / cap);
  const muted = { color: "var(--n-muted)" };

  return (
    <div className="space-y-4 rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--n-border)", background: "radial-gradient(600px 300px at 30% 0%, rgba(99,102,241,.12), transparent 70%), var(--n-surface)" }}>
      <style>{CSS}</style>

      <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
        {/* Core */}
        <div className="relative mx-auto h-44 w-44 sm:h-48 sm:w-48" role="img" aria-label={`${c.totalCount} people selected of a daily budget of ${cap}`}>
          <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" aria-hidden>
            <circle cx="90" cy="90" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="10" />
            <circle cx="90" cy="90" r={R} fill="none" stroke="url(#cc-g)" strokeWidth="10" strokeLinecap="round" className="cc-arc"
              strokeDasharray={`${mounted ? C * frac : 0} ${C}`} />
            <circle cx="90" cy="90" r="82" fill="none" stroke="rgba(125,211,252,.18)" strokeWidth="1" strokeDasharray="2 6" />
            <defs><linearGradient id="cc-g"><stop offset="0" stopColor="#67e8f9" /><stop offset="1" stopColor="#818cf8" /></linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-4xl font-semibold tabular-nums">{count}</span>
            <span className="text-xs" style={muted}>of {cap} budget</span>
            <span className="mt-1 max-w-[7.5rem] truncate text-xs" style={{ color: "var(--n-accent)" }}>{regionLabel}</span>
            <span className="text-[11px]" style={muted}>Shadow — no calls</span>
          </div>
        </div>

        {/* Selection reduction */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium" style={muted}>How it was picked</h4>
          {[
            { label: "Eligible pool", value: matched, hint: matched == null ? "at least the budget" : "after your filters" },
            { label: "Daily budget", value: cap, hint: "hard cap 1000" },
            { label: "Calling", value: c.totalCount, hint: "proposed today" },
          ].map((s, i, arr) => {
            const base = Math.max(matched ?? cap, cap, 1);
            const w = s.value == null ? 100 : Math.max(2, (s.value / base) * 100);
            return (
              <div key={s.label} className="cc-step" style={{ animationDelay: `${i * 220}ms` }}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>{s.label} <span className="text-xs" style={muted}>· {s.hint}</span></span>
                  <span className="font-semibold tabular-nums">{s.value == null ? `≥ ${cap}` : s.value}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
                  <div className="cc-arc h-1.5 rounded-full" style={{ width: mounted ? `${w}%` : "0%", transition: reduced ? "none" : `width 900ms ${i * 220}ms cubic-bezier(.2,.8,.2,1)`, background: i === arr.length - 1 ? "#67e8f9" : "#818cf8", opacity: s.value == null ? 0.45 : 1 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dials */}
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        <Dial title="Region" data={topN(c.fairness.byRegion)} mounted={mounted} />
        <Dial title="Confidence" data={conf} mounted={mounted} dimNote={c.confidenceAvailable === false || confVals.length === 0 ? "confidence sparse" : undefined} />
        <Dial title="Exploration vs core" data={explore} mounted={mounted} />
        <Dial title="Urgency" data={urg} mounted={mounted} dimNote={!c.urgencyAvailable || urgVals.length === 0 ? "awaiting urgency data" : undefined} />
        <Dial title="Fairness · category" data={topN(c.fairness.byCategory)} mounted={mounted} dimNote={c.fairness.categoryAvailable ? undefined : "SC/ST data pending"} />
      </div>

      <p className="text-xs" style={muted}>
        Distributions come from a representative sample of {c.sampleCount} out of {c.totalCount}; the headline count is the true total.
      </p>

      <div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="flex items-center gap-1.5 rounded text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-300" style={{ color: "var(--n-accent)" }}>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          {open ? "Hide" : "Show"} who's in it ({c.members.length} previewed)
        </button>
        {open && (
          <div className="mt-3 overflow-x-auto rounded-lg border" style={{ borderColor: "var(--n-border)" }}>
            <table className="w-full text-sm">
              <caption className="caption-bottom p-2 text-xs" style={muted}>
                Representative preview of {c.totalCount} — full list is resolved only at dispatch (disabled in this version).
              </caption>
              <thead className="text-xs" style={{ ...muted, background: "rgba(255,255,255,.03)" }}>
                <tr>{["Phone", "Region", "Category", "Conf.", "Campaigns", "Last call", "Urgency", "Priority", "Why"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {c.members.map((m, i) => (
                  <tr key={i} className="border-t align-top" style={{ borderColor: "var(--n-border)" }}>
                    <td className="px-3 py-2 font-mono text-xs">{m.phone_masked}</td>
                    <td className="px-3 py-2">{m.region || "—"}</td>
                    <td className="px-3 py-2">{m.category || "—"}</td>
                    <td className="px-3 py-2">{m.confidence ?? "—"}</td>
                    <td className="px-3 py-2">{m.total_campaigns}</td>
                    <td className="px-3 py-2">{m.last_call_date || "—"}</td>
                    <td className="px-3 py-2">
                      {m.urgency == null ? <span style={muted}>—</span> : (
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1.5">
                            <span className="font-semibold">{m.urgency}</span>
                            {m.is_urgent && <span className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2 py-0.5 text-xs text-amber-200">Urgent</span>}
                          </span>
                          {m.urgency_reason && <span className="text-xs" style={muted}>{m.urgency_reason}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold">{m.priority_score}</td>
                    <td className="px-3 py-2">
                      {m.is_exploration && <span className="mr-2 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--n-border)" }}>exploration</span>}
                      <span style={muted}>{m.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApprove} disabled={killed || status !== "proposed" || busy}
          className="rounded-full px-4 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-40"
          style={{ background: "var(--n-user)", color: "var(--n-user-text)" }}>Approve (shadow — no calls)</button>
        <button type="button" onClick={onCancel} disabled={status === "cancelled" || busy}
          className="rounded-full border px-4 py-2 text-sm outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-sky-300 disabled:opacity-40"
          style={{ borderColor: "var(--n-border)" }}>Cancel</button>
        <Tooltip>
          <TooltipTrigger asChild><span><button type="button" disabled className="rounded-full border px-4 py-2 text-sm opacity-40" style={{ borderColor: "var(--n-border)" }}>Dispatch</button></span></TooltipTrigger>
          <TooltipContent>Enabled in a later version once ATLAS is verified.</TooltipContent>
        </Tooltip>
        <span className="ml-auto rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--n-border)", ...muted }}>{status}</span>
      </div>
    </div>
  );
}

function Dial({ title, data, mounted, dimNote }: { title: string; data: Array<[string, number]>; mounted: boolean; dimNote?: string }) {
  const total = data.reduce((s, [, v]) => s + v, 0);
  const dim = !!dimNote || total === 0;
  const R = 26, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border p-3", dim && "opacity-55")} style={{ borderColor: "var(--n-border)" }}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 shrink-0 -rotate-90" aria-hidden>
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="7" strokeDasharray={dim ? "3 4" : undefined} />
        {!dim && data.map(([k, v], i) => {
          const len = (v / total) * C;
          const el = (
            <circle key={k} cx="32" cy="32" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="7" className="cc-arc"
              strokeDasharray={`${mounted ? Math.max(0, len - 1.5) : 0} ${C}`} strokeDashoffset={-acc} />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {dim ? (
          <p className="text-xs" style={{ color: "var(--n-muted)" }}>{dimNote ?? "no data in sample"}</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs">
            {data.map(([k, v], i) => (
              <li key={k} className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="truncate" style={{ color: "var(--n-muted)" }}>{k}</span>
                <span className="ml-auto font-medium tabular-nums">{v}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

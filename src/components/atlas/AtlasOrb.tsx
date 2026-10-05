import { useEffect, useRef } from "react";

// Dependency-free canvas neural globe: nodes on a rotating sphere, wired edges,
// and signal pulses travelling along edges that flare the node they reach.
type Pulse = { e: number; t: number; dir: 1 | -1; amber: boolean; speed: number };

const CYAN = [103, 232, 249];
const INDIGO = [129, 140, 248];
const AMBER = [251, 191, 36];

function mix(a: number[], b: number[], t: number) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

export function AtlasOrb({ size = 240, active = false, className }: { size?: number; active?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const small = size < 64;
    const N = small ? 18 : 40;
    const K = small ? 2 : 3;
    // Fibonacci sphere
    const pts: [number, number, number][] = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      pts.push([Math.cos(ga * i) * r, y, Math.sin(ga * i) * r]);
    }
    // Edges: K nearest neighbours each, deduped (rotation preserves distances).
    const seen = new Set<string>();
    const edges: [number, number][] = [];
    const nbrs: number[][] = pts.map(() => []);
    pts.forEach((p, i) => {
      pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2] as const)
        .filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, K)
        .forEach(([j]) => {
          const key = i < j ? `${i}-${j}` : `${j}-${i}`;
          if (seen.has(key)) return;
          seen.add(key);
          nbrs[i].push(edges.length); nbrs[j].push(edges.length);
          edges.push([i, j]);
        });
    });

    const flare = new Float32Array(N);
    const pulses: Pulse[] = [];
    const spawn = (fromEdge?: number, fromNode?: number) => {
      let e = fromEdge ?? Math.floor(Math.random() * edges.length);
      let dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      if (fromNode != null) {
        const opts = nbrs[fromNode];
        e = opts[Math.floor(Math.random() * opts.length)];
        dir = edges[e][0] === fromNode ? 1 : -1;
      }
      pulses.push({ e, t: 0, dir, amber: Math.random() < 0.12, speed: 0.6 + Math.random() * 0.5 });
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let angle = 0.6, level = activeRef.current ? 1 : 0, last = performance.now(), raf = 0, spawnAcc = 0;
    const cx = size / 2, cy = size / 2, R = size * 0.38;
    const tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);

    const project = (p: [number, number, number]) => {
      const ca = Math.cos(angle), sa = Math.sin(angle);
      const x = p[0] * ca + p[2] * sa;
      const z0 = -p[0] * sa + p[2] * ca;
      const y = p[1] * ct - z0 * st;
      const z = p[1] * st + z0 * ct;
      const depth = (z + 1) / 2; // 0 back .. 1 front
      return { x: cx + x * R, y: cy + y * R, depth };
    };

    const draw = (dt: number, animate: boolean) => {
      ctx.clearRect(0, 0, size, size);
      // soft core glow, fading to transparent at the rim
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.25);
      g.addColorStop(0, `rgba(99,102,241,${0.22 + level * 0.12})`);
      g.addColorStop(0.5, "rgba(56,189,248,0.06)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      const P = pts.map(project);
      ctx.lineWidth = small ? 0.6 : 0.8;
      for (const [a, b] of edges) {
        const d = (P[a].depth + P[b].depth) / 2;
        const c = mix(INDIGO, CYAN, d);
        ctx.strokeStyle = `rgba(${c},${0.08 + d * 0.32})`;
        ctx.beginPath(); ctx.moveTo(P[a].x, P[a].y); ctx.lineTo(P[b].x, P[b].y); ctx.stroke();
      }

      if (animate) {
        for (let i = pulses.length - 1; i >= 0; i--) {
          const p = pulses[i];
          p.t += dt * p.speed * (1 + level * 0.9);
          if (p.t >= 1) {
            const [a, b] = edges[p.e];
            const node = p.dir === 1 ? b : a;
            flare[node] = 1;
            pulses.splice(i, 1);
            if (Math.random() < 0.55 + level * 0.25) spawn(undefined, node); // propagate
          }
        }
        const maxP = small ? 3 + level * 2 : 6 + level * 8;
        spawnAcc += dt * (1.2 + level * 3);
        while (spawnAcc > 1) { spawnAcc -= 1; if (pulses.length < maxP) spawn(); }
        for (let i = 0; i < N; i++) flare[i] = Math.max(0, flare[i] - dt * 2.2);
      }

      ctx.save();
      ctx.shadowBlur = small ? 3 : 10;
      for (let i = 0; i < N; i++) {
        const { x, y, depth } = P[i];
        const f = flare[i];
        const c = mix(INDIGO, CYAN, depth);
        const r = (small ? 0.8 : 1.4) + depth * (small ? 1 : 1.8) + f * (small ? 1 : 2.5);
        ctx.shadowColor = `rgba(${c},0.9)`;
        ctx.fillStyle = `rgba(${mix(c, [255, 255, 255], f * 0.6)},${0.25 + depth * 0.65 + f * 0.2})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      for (const p of pulses) {
        const [a, b] = edges[p.e];
        const s = p.dir === 1 ? P[a] : P[b], t = p.dir === 1 ? P[b] : P[a];
        const x = s.x + (t.x - s.x) * p.t, y = s.y + (t.y - s.y) * p.t;
        const d = s.depth + (t.depth - s.depth) * p.t;
        const c = p.amber ? AMBER : CYAN;
        ctx.shadowColor = `rgba(${c},1)`;
        ctx.shadowBlur = (small ? 4 : 12) * (1 + level * 0.5);
        ctx.fillStyle = `rgba(${c},${0.4 + d * 0.5 + level * 0.1})`;
        ctx.beginPath(); ctx.arc(x, y, (small ? 0.9 : 1.6) + d * (small ? 0.6 : 1.2), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };

    if (reduced) { draw(0, false); return; }

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      level += ((activeRef.current ? 1 : 0) - level) * Math.min(1, dt * 2.5); // ease idle<->active
      angle += dt * (0.18 + level * 0.32);
      draw(dt, true);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) { last = performance.now(); raf = requestAnimationFrame(loop); }
    };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
  }, [size]);

  return <canvas ref={ref} aria-hidden className={className} style={{ width: size, height: size, display: "block" }} />;
}

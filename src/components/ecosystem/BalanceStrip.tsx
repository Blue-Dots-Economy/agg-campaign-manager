import type { JobPost } from "./mockData";
import {
  GAP_LEVEL_BAR_CLASSES,
  GAP_LEVEL_TEXT_CLASSES,
  fmtInt,
  type GapLevel,
} from "./ecosystemHelpers";

export interface BalanceRow {
  key: string;
  openings: number;
  applications: number;
  gap: number;
  partial: number;
  right: number;
  level: GapLevel;
  jobs: JobPost[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const xp = (f: number) => clamp(((f - 0.4) / 1.2) * 100, 1, 99);
const CENTER = xp(1.0);
const BAND_LEFT = xp(0.9);
const BAND_RIGHT = xp(1.2);

export function BalanceStrip({
  rows,
  onRowClick,
}: {
  rows: BalanceRow[];
  onRowClick: (r: BalanceRow) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 px-1">
        <div className="w-[160px] shrink-0" />
        <div className="flex-1 flex justify-between text-[11px] text-muted-foreground">
          <span>← shortage</span>
          <span>balanced</span>
          <span>surplus →</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-[130px] text-right text-[11px] text-muted-foreground">Openings</div>
          <div className="w-[68px] text-right text-[11px] text-muted-foreground">Partial Fit</div>
          <div className="w-[68px] text-right text-[11px] text-emerald-700 dark:text-emerald-400">
            Right Fit
          </div>
        </div>
      </div>

      <div className="max-h-[440px] overflow-y-auto pr-2">
        {rows.map((r) => {
          const coverage = r.openings > 0 ? 1 - r.gap / r.openings : 1;
          const pos = xp(coverage);
          const left = Math.min(pos, CENTER);
          const width = Math.max(1.2, Math.abs(pos - CENTER));
          const rightText =
            r.gap > 0 ? `${r.gap} short` : r.gap < 0 ? `${Math.abs(r.gap)} surplus` : "balanced";
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => onRowClick(r)}
              className="w-full flex items-center gap-3 px-1 py-2 rounded-md hover:bg-muted/40 text-left transition-colors"
            >
              <div className="w-[160px] shrink-0 text-right text-sm font-medium truncate">
                {r.key}
              </div>
              <div className="flex-1 relative h-6">
                <div
                  className="absolute inset-y-0 rounded-md bg-emerald-500/10"
                  style={{ left: `${BAND_LEFT}%`, width: `${BAND_RIGHT - BAND_LEFT}%` }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-border"
                  style={{ left: `${CENTER}%` }}
                />
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-3 rounded ${GAP_LEVEL_BAR_CLASSES[r.level]}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="w-[130px] text-right">
                  <div className="text-sm tabular-nums">{fmtInt(r.openings)} open</div>
                  <div className={`text-xs tabular-nums ${GAP_LEVEL_TEXT_CLASSES[r.level]}`}>
                    {rightText}
                  </div>
                </div>
                <div className="w-[68px] text-right text-sm tabular-nums text-amber-700 dark:text-amber-400">
                  {fmtInt(r.partial)}
                </div>
                <div className="w-[68px] text-right text-sm tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                  {fmtInt(r.right)}
                </div>
              </div>
            </button>
          );
        })}

        {rows.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No open jobs for this district.
          </div>
        )}
      </div>
    </div>
  );
}

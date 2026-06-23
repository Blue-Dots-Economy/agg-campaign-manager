import { useMemo, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export type StateValue = "all" | "GZB" | "KA";

export interface OverviewFilterValue {
  state: StateValue;
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null;
}

const STATE_OPTIONS: { value: StateValue; label: string }[] = [
  { value: "all", label: "All states" },
  { value: "GZB", label: "GZB · Ghaziabad" },
  { value: "KA", label: "KA · Hubli-Dharwad" },
];

const fmt = (d: Date) => format(d, "yyyy-MM-dd");

export function OverviewFilters({
  value,
  onChange,
}: {
  value: OverviewFilterValue;
  onChange: (next: OverviewFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);

  const range: DateRange | undefined = useMemo(() => {
    if (!value.dateFrom && !value.dateTo) return undefined;
    return {
      from: value.dateFrom ? new Date(value.dateFrom) : undefined,
      to: value.dateTo ? new Date(value.dateTo) : undefined,
    };
  }, [value.dateFrom, value.dateTo]);

  const dateLabel = useMemo(() => {
    if (!value.dateFrom && !value.dateTo) return "All time";
    const f = value.dateFrom ? format(new Date(value.dateFrom), "MMM d, yyyy") : "…";
    const t = value.dateTo ? format(new Date(value.dateTo), "MMM d, yyyy") : "…";
    return `${f} → ${t}`;
  }, [value.dateFrom, value.dateTo]);

  const setPreset = (days: number | null) => {
    if (days === null) {
      onChange({ ...value, dateFrom: null, dateTo: null });
    } else {
      const to = new Date();
      const from = subDays(to, days - 1);
      onChange({ ...value, dateFrom: fmt(from), dateTo: fmt(to) });
    }
    setOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* State segmented control */}
      <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
        {STATE_OPTIONS.map((opt) => {
          const active = value.state === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...value, state: opt.value })}
              className={cn(
                "px-3 py-1.5 rounded transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Date range */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-2 text-xs font-normal",
              !value.dateFrom && !value.dateTo && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-col gap-1 border-b sm:border-b-0 sm:border-r border-border p-2 text-xs min-w-[140px]">
              <button
                type="button"
                className="text-left px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => setPreset(null)}
              >
                All time
              </button>
              <button
                type="button"
                className="text-left px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => setPreset(7)}
              >
                Last 7 days
              </button>
              <button
                type="button"
                className="text-left px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => setPreset(30)}
              >
                Last 30 days
              </button>
            </div>
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={range}
              onSelect={(r) => {
                onChange({
                  ...value,
                  dateFrom: r?.from ? fmt(r.from) : null,
                  dateTo: r?.to ? fmt(r.to) : null,
                });
              }}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
        </PopoverContent>
      </Popover>

      {(value.dateFrom || value.dateTo || value.state !== "all") && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground"
          onClick={() => onChange({ state: "all", dateFrom: null, dateTo: null })}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

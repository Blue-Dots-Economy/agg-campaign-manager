import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ScheduleState {
  timezone: string;
  startTime: string;
  endTime: string;
  days: number[]; // 1=Mon … 7=Sun
}

export const defaultSchedule: ScheduleState = {
  timezone: "Asia/Kolkata",
  startTime: "09:00",
  endTime: "18:00",
  days: [1, 2, 3, 4, 5],
};

const DAYS: { v: number; label: string }[] = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 7, label: "Sun" },
];

export function ScheduleEditor({
  value,
  onChange,
}: {
  value: ScheduleState;
  onChange: (next: ScheduleState) => void;
}) {
  const toggleDay = (d: number) => {
    const has = value.days.includes(d);
    const days = has ? value.days.filter((x) => x !== d) : [...value.days, d].sort();
    onChange({ ...value, days });
  };

  const timeInvalid = value.startTime >= value.endTime;
  const noDays = value.days.length === 0;

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Days of week</Label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {DAYS.map((d) => {
            const on = value.days.includes(d.v);
            return (
              <button
                key={d.v}
                type="button"
                onClick={() => toggleDay(d.v)}
                className={cn(
                  "h-8 min-w-10 px-2 rounded-md text-xs font-medium border transition-colors",
                  on
                    ? "bg-brand text-brand-foreground border-brand"
                    : "bg-card text-foreground border-border hover:bg-muted",
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {noDays && <p className="text-[11px] text-destructive mt-1">Pick at least one day.</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="start" className="text-xs">Start time</Label>
          <Input
            id="start"
            type="time"
            value={value.startTime}
            onChange={(e) => onChange({ ...value, startTime: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="end" className="text-xs">End time</Label>
          <Input
            id="end"
            type="time"
            value={value.endTime}
            onChange={(e) => onChange({ ...value, endTime: e.target.value })}
            className="mt-1"
          />
        </div>
      </div>
      {timeInvalid && (
        <p className="text-[11px] text-destructive">End time must be after start time.</p>
      )}

      <div>
        <Label htmlFor="tz" className="text-xs">Timezone (IANA)</Label>
        <Input
          id="tz"
          value={value.timezone}
          onChange={(e) => onChange({ ...value, timezone: e.target.value })}
          className="mt-1"
          placeholder="Asia/Kolkata"
        />
      </div>
    </div>
  );
}

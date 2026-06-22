// Program config registry. Add a new program = add a new ProgramConfig here.

export type KpiKey = string;

export interface KpiDef {
  key: KpiKey;
  label: string;
  icon: string; // lucide icon name
  format: "number" | "percent";
  target?: number; // for the progress ring (out of 100 for percent, or a target count)
}

export interface LaunchStep {
  title: string;
  description: string;
}

export interface ProgramConfig {
  id: "kkb" | "dkb";
  label: string;
  subtitle: string;
  brandColor: string;
  sheetCsvUrl: string;
  sheetLabel: string;
  rayaAgentId: string;
  fromNumber: string;
  columns: string[];
  kpis: KpiDef[];
  dropReasons: string[];
  launchSteps: LaunchStep[];
  successMetric: "applications" | "interviews";
}

const KKB_COLUMNS = [
  "campaign_day",
  "campaign_date",
  "campaign_type",
  "language",
  "call_id",
  "phone",
  "call_duration_seconds",
  "call_datetime_ist",
  "call_outcome",
  "call_answered",
  "call_engaged",
  "applied_to_job",
  "applications_count",
  "jobs_shown",
  "primary_topic",
  "call_language",
  "call_recording_url",
  "final_summary",
  "call_transcript",
  "tried_to_apply",
  "drop_reason",
  "city_campaign",
  "seeker_name",
  "user_intent",
  "jobs_recommended",
  "jobs_applied",
  "jobs_failed_to_apply",
  "Intent Score",
  "Intent Score Reasoning",
];

const DKB_COLUMNS = [
  "campaign_day",
  "campaign_date",
  "campaign_type",
  "language",
  "call_id",
  "phone",
  "call_duration_seconds",
  "call_datetime_ist",
  "call_outcome",
  "call_answered",
  "call_engaged",
  "counselled",
  "interview_scheduled",
  "course_interest",
  "trade",
  "counsellor_id",
  "call_recording_url",
  "final_summary",
  "drop_reason",
  "city_campaign",
  "candidate_name",
  "user_intent",
  "Intent Score",
  "Intent Score Reasoning",
  // TBD — configurable
];

export const kkb: ProgramConfig = {
  id: "kkb",
  label: "KKB",
  subtitle: "KKB · voice outreach",
  brandColor: "#0F6E56",
  sheetCsvUrl: "",
  sheetLabel: "KKB master sheet",
  rayaAgentId: "raya_kkb_v3",
  fromNumber: "+91-80-4718-0000",
  columns: KKB_COLUMNS,
  successMetric: "applications",
  kpis: [
    { key: "total_calls", label: "Total calls", icon: "Phone", format: "number", target: 1000 },
    { key: "answered_pct", label: "Answered %", icon: "PhoneCall", format: "percent", target: 100 },
    { key: "engaged_pct", label: "Engaged %", icon: "MessageCircle", format: "percent", target: 100 },
    { key: "applications", label: "Applications", icon: "FileCheck", format: "number", target: 300 },
    { key: "high_intent", label: "High-intent (≥5)", icon: "Flame", format: "number", target: 200 },
  ],
  dropReasons: [
    "early_hangup",
    "user_declined",
    "no_matching_jobs",
    "apply_failed",
    "profile_loop",
    "other",
  ],
  launchSteps: [
    { title: "Upload seeker CSV", description: "Drop the source list of seekers" },
    { title: "Auto-detect region (KA / GZB)", description: "Region inferred from filename" },
    { title: "Match + derive columns", description: "Map to the 29-column KKB schema" },
    { title: "Schedule call window", description: "Pick a date and time window" },
    { title: "Push batch to Raya", description: "Hand off to the voice agent" },
  ],
};

export const dkb: ProgramConfig = {
  id: "dkb",
  label: "DKB",
  subtitle: "DKB · skilling outreach",
  brandColor: "#0F6E56",
  sheetCsvUrl: "",
  sheetLabel: "DKB master sheet",
  rayaAgentId: "raya_dkb_v1",
  fromNumber: "+91-80-4718-0001",
  columns: DKB_COLUMNS,
  successMetric: "interviews",
  kpis: [
    { key: "total_calls", label: "Total calls", icon: "Phone", format: "number", target: 800 },
    { key: "answered_pct", label: "Answered %", icon: "PhoneCall", format: "percent", target: 100 },
    { key: "counselled_pct", label: "Counselled %", icon: "GraduationCap", format: "percent", target: 100 },
    { key: "interviews", label: "Interviews", icon: "CalendarCheck", format: "number", target: 150 },
    { key: "high_intent", label: "High-intent (≥5)", icon: "Flame", format: "number", target: 150 },
  ],
  dropReasons: [
    "not_interested",
    "callback_later",
    "course_full",
    "wrong_trade",
    "language",
    "other",
  ],
  launchSteps: [
    { title: "Upload candidate CSV", description: "Drop the source list of candidates" },
    { title: "Map course / trade interest", description: "Match candidates to available trades" },
    { title: "Assign counsellor slot", description: "Pick a counsellor and slot" },
    { title: "Schedule call window", description: "Pick a date and time window" },
    { title: "Push batch to Raya", description: "Hand off to the voice agent" },
  ],
};

export const registry: Record<"kkb" | "dkb", ProgramConfig> = { kkb, dkb };
export type ProgramId = keyof typeof registry;

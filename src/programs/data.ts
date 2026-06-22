// Mock data layer. Swap to live Google-Sheets CSV fetch later — see TODO at bottom.

import type { ProgramConfig } from "./registry";

export interface CallRow {
  campaign_day: string;
  campaign_date: string;
  campaign_type: string;
  language: string;
  call_id: string;
  phone: string;
  call_duration_seconds: number;
  call_datetime_ist: string;
  call_outcome: string;
  call_answered: boolean;
  call_engaged: boolean;
  applied_to_job: boolean;
  applications_count: number;
  jobs_shown: boolean;
  primary_topic: string;
  call_language: string;
  call_recording_url: string;
  final_summary: string;
  call_transcript: string;
  tried_to_apply: boolean;
  drop_reason: string;
  city_campaign: string;
  seeker_name: string;
  user_intent: string;
  jobs_recommended: string[];
  jobs_applied: string[];
  jobs_failed_to_apply: string[];
  "Intent Score": number;
  "Intent Score Reasoning": string;
  // DKB-only fields (optional; coexist for simplicity)
  counselled?: boolean;
  interview_scheduled?: boolean;
  course_interest?: string;
  trade?: string;
  counsellor_id?: string;
  candidate_name?: string;
  /** Raw header→value map from the source sheet. Use for program-specific columns. */
  raw?: Record<string, string>;
}

// Deterministic PRNG so the dashboard is stable across reloads.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES_HI = ["Rahul", "Priya", "Amit", "Sunita", "Vikas", "Pooja", "Rohit", "Neha", "Arjun", "Kavita"];
const FIRST_NAMES_KN = ["Manjunath", "Lakshmi", "Suresh", "Geetha", "Ravi", "Shilpa", "Kiran", "Anitha", "Naveen", "Divya"];
const LAST_NAMES_HI = ["Kumar", "Sharma", "Verma", "Gupta", "Singh", "Yadav"];
const LAST_NAMES_KN = ["Gowda", "Hegde", "Naik", "Patil", "Shetty", "Rao"];

const KKB_JOBS = ["Delivery exec", "Warehouse picker", "Cashier", "Security guard", "Field sales", "Cook helper", "Driver", "Beautician"];
const DKB_TRADES = ["Electrician", "Plumber", "AC repair", "Tailoring", "Beautician", "Mobile repair", "Welder", "Solar installer"];

const KKB_OUTCOMES = ["completed", "voicemail", "no_answer", "busy", "early_drop"];
const DKB_OUTCOMES = ["completed", "voicemail", "no_answer", "busy", "callback_requested"];

const cache = new Map<string, CallRow[]>();

export function getCampaignData(config: ProgramConfig): CallRow[] {
  if (cache.has(config.id)) return cache.get(config.id)!;
  const rand = mulberry32(config.id === "kkb" ? 42 : 1337);
  const rows: CallRow[] = [];
  const days = 8;
  const perDay = config.id === "kkb" ? 95 : 70;

  for (let d = 1; d <= days; d++) {
    for (let i = 0; i < perDay; i++) {
      const isKannada = rand() > 0.5;
      const language = isKannada ? "Kannada" : "Hindi";
      const city = isKannada ? "Hubli-Dharwad" : "Ghaziabad";
      const fn = isKannada
        ? FIRST_NAMES_KN[Math.floor(rand() * FIRST_NAMES_KN.length)]
        : FIRST_NAMES_HI[Math.floor(rand() * FIRST_NAMES_HI.length)];
      const ln = isKannada
        ? LAST_NAMES_KN[Math.floor(rand() * LAST_NAMES_KN.length)]
        : LAST_NAMES_HI[Math.floor(rand() * LAST_NAMES_HI.length)];
      const answered = rand() < 0.62;
      const engaged = answered && rand() < 0.7;
      const outcomeList = config.id === "kkb" ? KKB_OUTCOMES : DKB_OUTCOMES;
      const outcome = answered ? "completed" : outcomeList[1 + Math.floor(rand() * (outcomeList.length - 1))];
      const intent = engaged ? Math.floor(rand() * 8) + 3 : Math.floor(rand() * 4);
      const dropReason = engaged
        ? config.dropReasons[Math.floor(rand() * config.dropReasons.length)]
        : !answered
          ? "early_hangup"
          : config.dropReasons[Math.floor(rand() * config.dropReasons.length)];

      const date = new Date(2025, 5, d + 14);
      const dateStr = date.toISOString().slice(0, 10);
      const dt = new Date(date);
      dt.setHours(10 + Math.floor(rand() * 7), Math.floor(rand() * 60));

      const tried = engaged && rand() < 0.55;
      const applied = tried && rand() < 0.7;
      const recCount = engaged ? 2 + Math.floor(rand() * 4) : 0;
      const recs = Array.from({ length: recCount }, () => KKB_JOBS[Math.floor(rand() * KKB_JOBS.length)]);
      const appliedJobs = applied ? recs.slice(0, 1 + Math.floor(rand() * 2)) : [];
      const failedJobs = tried && !applied ? recs.slice(0, 1) : [];

      const row: CallRow = {
        campaign_day: `Day ${d}`,
        campaign_date: dateStr,
        campaign_type: config.id === "kkb" ? (d % 2 === 0 ? "fresh_outreach" : "reactivation") : (d % 2 === 0 ? "counselling" : "follow_up"),
        language,
        call_id: `${config.id.toUpperCase()}-D${d}-${String(i).padStart(4, "0")}`,
        phone: `+91${9000000000 + Math.floor(rand() * 99999999)}`,
        call_duration_seconds: answered ? 30 + Math.floor(rand() * 240) : Math.floor(rand() * 15),
        call_datetime_ist: dt.toISOString(),
        call_outcome: outcome,
        call_answered: answered,
        call_engaged: engaged,
        applied_to_job: applied,
        applications_count: appliedJobs.length,
        jobs_shown: recCount > 0,
        primary_topic: engaged ? (rand() < 0.5 ? "job_search" : "salary_query") : "n/a",
        call_language: language,
        call_recording_url: `https://recordings.example.com/${config.id}/${d}-${i}.mp3`,
        final_summary: engaged ? "Seeker discussed openings and next steps." : "Call did not progress.",
        call_transcript: "...",
        tried_to_apply: tried,
        drop_reason: applied ? "" : dropReason,
        city_campaign: city,
        seeker_name: `${fn} ${ln}`,
        user_intent: intent >= 5 ? "high" : intent >= 3 ? "medium" : "low",
        jobs_recommended: recs,
        jobs_applied: appliedJobs,
        jobs_failed_to_apply: failedJobs,
        "Intent Score": intent,
        "Intent Score Reasoning": intent >= 5 ? "Engaged and asked about specifics" : "Limited engagement",
      };

      if (config.id === "dkb") {
        const counselled = engaged && rand() < 0.6;
        row.counselled = counselled;
        row.interview_scheduled = counselled && rand() < 0.45;
        row.course_interest = DKB_TRADES[Math.floor(rand() * DKB_TRADES.length)];
        row.trade = row.course_interest;
        row.counsellor_id = `C-${100 + Math.floor(rand() * 12)}`;
        row.candidate_name = row.seeker_name;
      }

      rows.push(row);
    }
  }

  cache.set(config.id, rows);
  return rows;
}

// TODO(phase-2): replace mock generation with a CSV fetch from config.sheetCsvUrl:
//   const text = await fetch(config.sheetCsvUrl).then(r => r.text());
//   return parseCsv(text, config.columns);

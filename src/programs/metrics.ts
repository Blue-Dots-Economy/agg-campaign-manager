import type { CallRow } from "./data";
import type { ProgramConfig } from "./registry";

export function computeKpis(config: ProgramConfig, rows: CallRow[]): Record<string, number> {
  const total = rows.length;
  const answered = rows.filter((r) => r.call_answered).length;
  const engaged = rows.filter((r) => r.call_engaged).length;
  const applications = rows.filter((r) => r.applied_to_job).length;
  const highIntent = rows.filter((r) => r["Intent Score"] >= 5).length;

  if (config.id === "kkb") {
    return {
      total_calls: total,
      answered_pct: total ? Math.round((answered / total) * 100) : 0,
      engaged_pct: total ? Math.round((engaged / total) * 100) : 0,
      applications,
      high_intent: highIntent,
    };
  }
  // dkb
  const counselled = rows.filter((r) => r.counselled).length;
  const interviews = rows.filter((r) => r.interview_scheduled).length;
  return {
    total_calls: total,
    answered_pct: total ? Math.round((answered / total) * 100) : 0,
    counselled_pct: total ? Math.round((counselled / total) * 100) : 0,
    interviews,
    high_intent: highIntent,
  };
}

export function byCampaignDay(config: ProgramConfig, rows: CallRow[]) {
  const map = new Map<string, CallRow[]>();
  for (const r of rows) {
    if (!map.has(r.campaign_day)) map.set(r.campaign_day, []);
    map.get(r.campaign_day)!.push(r);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => parseInt(a.split(" ")[1]) - parseInt(b.split(" ")[1]))
    .map(([day, dayRows]) => {
      const answered = dayRows.filter((r) => r.call_answered).length;
      const engaged = dayRows.filter((r) => r.call_engaged).length;
      const converted =
        config.id === "kkb"
          ? dayRows.filter((r) => r.applied_to_job).length
          : dayRows.filter((r) => r.interview_scheduled).length;
      return {
        day,
        date: dayRows[0].campaign_date,
        type: dayRows[0].campaign_type,
        language: dayRows[0].language,
        rows: dayRows.length,
        answered,
        engaged,
        converted,
        answered_pct: Math.round((answered / dayRows.length) * 100),
        high_intent: dayRows.filter((r) => r["Intent Score"] >= 5).length,
      };
    });
}

export function dropReasonBreakdown(config: ProgramConfig, rows: CallRow[]) {
  const buckets = Object.fromEntries(config.dropReasons.map((r) => [r, 0]));
  for (const r of rows) {
    const reason = r.drop_reason;
    if (!reason) continue;
    if (reason in buckets) buckets[reason]++;
    else buckets.other = (buckets.other ?? 0) + 1;
  }
  return Object.entries(buckets).map(([reason, count]) => ({ reason, count }));
}

export function intentDistribution(rows: CallRow[]) {
  const buckets: Record<number, number> = {};
  for (let i = 0; i <= 10; i++) buckets[i] = 0;
  for (const r of rows) buckets[r["Intent Score"]] = (buckets[r["Intent Score"]] ?? 0) + 1;
  return Object.entries(buckets).map(([score, count]) => ({ score: `${score}`, count }));
}

export function regionSplit(rows: CallRow[]) {
  const ka = rows.filter((r) => r.city_campaign === "Hubli-Dharwad").length;
  const gzb = rows.filter((r) => r.city_campaign === "Ghaziabad").length;
  return [
    { region: "KA", count: ka },
    { region: "GZB", count: gzb },
  ];
}

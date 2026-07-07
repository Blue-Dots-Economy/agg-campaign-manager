import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { useProgram } from "@/programs/context";
import { useCampaignList } from "@/programs/useProgramAggregates";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/components/Panel";
import { LoadingState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/campaign-review/")({
  component: CampaignReviewList,
});

const RECENT_WINDOW_DAYS = 2;

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function CampaignReviewList() {
  const { config } = useProgram();
  const isDkb = config.id === "dkb";
  const successLabel = isDkb ? "Active providers" : "Converted";
  const { data, isLoading } = useCampaignList(config, {});
  const [search, setSearch] = useState("");

  const { recent, all } = useMemo(() => {
    const items = (data ?? []).slice();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = today.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    items.sort((a, b) => (b.campaignDate ?? "").localeCompare(a.campaignDate ?? ""));
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((c) =>
          humanizeCampaignType(c.campaignType).toLowerCase().includes(q) ||
          c.campaignType.toLowerCase().includes(q),
        )
      : items;
    const recent = filtered.filter((c) => {
      const d = parseDate(c.campaignDate);
      return d ? d.getTime() >= cutoff : false;
    });
    return { recent, all: filtered };
  }, [data, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaign review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Drill into one campaign and compare it to its region's average.
          </p>
        </div>
        <div className="relative w-72 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by campaign name"
            className="pl-8 h-9"
          />
        </div>
      </div>

      {isLoading && !data ? (
        <LoadingState />
      ) : (
        <>
          {recent.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Latest · review pending
                </h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {recent.map((c) => (
                  <CampaignCard
                    key={`${c.campaignType}__${c.campaignDate ?? "nodate"}`}
                    campaign={c}
                    successLabel={successLabel}
                    highlighted
                  />
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              All campaigns
            </h2>
            <Panel>
              <ul className="divide-y divide-border">
                {all.length === 0 ? (
                  <li className="py-6 text-center text-sm text-muted-foreground">
                    No campaigns match your search.
                  </li>
                ) : (
                  all.map((c) => (
                    <CampaignRow key={`${c.campaignType}__${c.campaignDate ?? "nodate"}`} campaign={c} successLabel={successLabel} />
                  ))
                )}
              </ul>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}

interface CampaignLike {
  campaignType: string;
  campaignDate: string | null;
  region: string | null;
  totalCalls: number;
  answered: number;
  engaged: number;
  converted: number;
}

function formatDate(d: string | null): string {
  const dt = parseDate(d);
  return dt ? format(dt, "MMM d, yyyy") : "—";
}

function pct(n: number, d: number): string {
  if (!d) return "—";
  return `${Math.round((n / d) * 1000) / 10}%`;
}

function CampaignCard({
  campaign,
  successLabel,
  highlighted,
}: {
  campaign: CampaignLike;
  successLabel: string;
  highlighted?: boolean;
}) {
  return (
    <Link
      to="/campaign-review/$campaign"
      params={{ campaign: campaign.campaignType }}
      className={cn(
        "group block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40",
        highlighted ? "border-primary border-2 shadow-sm" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold truncate">{humanizeCampaignType(campaign.campaignType)}</h3>
            {highlighted && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
                New
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {formatDate(campaign.campaignDate)}
            {campaign.region ? ` · ${campaign.region}` : ""}
          </div>
        </div>
        <span className={cn(buttonVariants({ size: "sm" }), "shrink-0 gap-1.5 pointer-events-none")}>
          Review
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <Metric label="Calls" value={campaign.totalCalls.toLocaleString()} />
        <Metric label="Answered" value={pct(campaign.answered, campaign.totalCalls)} />
        <Metric label="Engaged" value={campaign.engaged.toLocaleString()} />
        <Metric label={successLabel} value={campaign.converted.toLocaleString()} />
      </div>
    </Link>
  );
}

function CampaignRow({ campaign, successLabel }: { campaign: CampaignLike; successLabel: string }) {
  return (
    <li>
      <Link
        to="/campaign-review/$campaign"
        params={{ campaign: campaign.campaignType }}
        className="group flex items-center gap-4 py-3 px-1 hover:bg-muted/40 rounded-md transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{humanizeCampaignType(campaign.campaignType)}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {formatDate(campaign.campaignDate)}
            {campaign.region ? ` · ${campaign.region}` : ""}
          </div>
        </div>
        <div className="hidden sm:grid grid-cols-4 gap-6 text-xs text-right">
          <Metric label="Calls" value={campaign.totalCalls.toLocaleString()} align="right" />
          <Metric label="Answered" value={pct(campaign.answered, campaign.totalCalls)} align="right" />
          <Metric label="Engaged" value={campaign.engaged.toLocaleString()} align="right" />
          <Metric label={successLabel} value={campaign.converted.toLocaleString()} align="right" />
        </div>
        <span className={cn(buttonVariants({ size: "sm" }), "ml-2 shrink-0 gap-1.5 pointer-events-none")}>
          Review
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>
    </li>
  );
}

function Metric({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

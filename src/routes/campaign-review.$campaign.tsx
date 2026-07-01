import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { useProgram } from "@/programs/context";
import { useCampaignList } from "@/programs/useProgramAggregates";
import { ProgramAnalytics } from "@/components/metrics/ProgramAnalytics";
import { CampaignVerdict } from "@/components/campaigns/CampaignVerdict";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { LoadingState, NoDataState } from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/campaign-review/$campaign")({
  component: CampaignReviewDetail,
});

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function CampaignReviewDetail() {
  const { campaign: rawCampaign } = Route.useParams();
  const navigate = useNavigate();
  const { config } = useProgram();
  const { data: campaigns, isLoading } = useCampaignList(config, {});

  const sorted = useMemo(
    () =>
      (campaigns ?? [])
        .slice()
        .sort((a, b) => (b.campaignDate ?? "").localeCompare(a.campaignDate ?? "")),
    [campaigns],
  );
  const current = sorted.find((c) => c.campaignType === rawCampaign);

  if (isLoading && !campaigns) return <LoadingState />;

  if (!current) {
    return (
      <div className="space-y-4">
        <Link
          to="/campaign-review"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>
        <NoDataState reason="no_results" />
      </div>
    );
  }

  const region = current.region ?? null;
  const dateLabel = (() => {
    const d = parseDate(current.campaignDate);
    return d ? format(d, "MMM d, yyyy") : "—";
  })();
  const label = region ?? "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/campaign-review"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All campaigns
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 truncate">
            {humanizeCampaignType(current.campaignType)}
          </h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {dateLabel}
            {region ? ` · ${region}` : ""}
          </div>
        </div>
        <div className="w-72 max-w-full">
          <Select
            value={current.campaignType}
            onValueChange={(v) =>
              navigate({ to: "/campaign-review/$campaign", params: { campaign: v } })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Switch campaign" />
              <ChevronDown className="h-4 w-4 opacity-50" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {sorted.map((c) => (
                <SelectItem key={c.campaignType} value={c.campaignType}>
                  {humanizeCampaignType(c.campaignType)}
                  {c.campaignDate ? ` · ${c.campaignDate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ProgramAnalytics
        config={config}
        filters={{ state: "all", dateFrom: null, dateTo: null, campaignType: "all" }}
        campaign={current.campaignType}
        comparison={{ mode: "state-average", region, label }}
      />
    </div>
  );
}

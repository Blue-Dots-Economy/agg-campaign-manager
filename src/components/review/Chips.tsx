import { cn } from "@/lib/utils";
const STATUS_STYLES: Record<string, string> = {
  Active: "bg-[#D1FAE5] text-[#065F46]", Closed: "bg-[#FEE2E2] text-[#991B1B]",
  Unverified: "bg-[#FEF3C7] text-[#92400E]", "Not Called": "bg-[#F3F4F6] text-[#374151]",
};
const OUTCOME_STYLES: Record<string, string> = {
  Completed: "bg-[#CCFBF1] text-[#0D9488]", "Early Disconnect": "bg-[#FFEDD5] text-[#C2410C]",
  "No Answer": "bg-[#F3F4F6] text-[#374151]",
};
export function StatusChip({ status }: { status?: string }) {
  if (!status) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_STYLES[status] ?? "bg-muted text-muted-foreground")}>{status}</span>;
}
export function OutcomeChip({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", OUTCOME_STYLES[outcome] ?? "bg-muted text-muted-foreground")}>{outcome}</span>;
}

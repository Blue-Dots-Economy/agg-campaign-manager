import { useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { JobPost } from "./mockData";
import {
  FRESHNESS_LABEL,
  applicationBucket,
  fmtDate,
  fmtInt,
  fmtSalary,
  jobFreshness,
  nz,
} from "./ecosystemHelpers";
import { ArrowDown, ArrowUp } from "lucide-react";

type SortKey =
  | "title"
  | "posted_by"
  | "area"
  | "salary_offered"
  | "posted_date"
  | "current_openings"
  | "applications"
  | "shortlisted";

const PAGE_SIZE = 10;

export function ApplicationStatusTable({ jobs }: { jobs: JobPost[] }) {
  const [location, setLocation] = useState("all");
  const [company, setCompany] = useState("all");
  const [role, setRole] = useState("all");
  const [bucket, setBucket] = useState("all");
  const [freshness, setFreshness] = useState("all");
  const [action, setAction] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("posted_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const openJobs = jobs.filter((j) => j.status === "open");

  const uniq = <K extends keyof JobPost>(key: K) =>
    Array.from(new Set(openJobs.map((j) => String(j[key])))).filter(Boolean).sort();

  const locations = uniq("area");
  const companies = uniq("posted_by");
  const roles = uniq("title");
  const actions = uniq("recommended_action_provider");

  const dupeKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of openJobs) {
      const k = `${j.title}|${j.posted_by}|${j.area}|${j.current_openings}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [openJobs]);

  const filtered = openJobs.filter((j) => {
    if (location !== "all" && j.area !== location) return false;
    if (company !== "all" && j.posted_by !== company) return false;
    if (role !== "all" && j.title !== role) return false;
    if (bucket !== "all" && applicationBucket(j.applications) !== bucket) return false;
    if (freshness !== "all" && jobFreshness(j.posted_date) !== freshness) return false;
    if (action !== "all" && j.recommended_action_provider !== action) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    let cmp = 0;
    if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
    else cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const paged = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const SortHead = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <TableHead className={right ? "text-right" : ""}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${right ? "justify-end w-full" : ""}`}
      >
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : null}
      </button>
    </TableHead>
  );

  return (
    <Panel
      title="Application Status"
      description="Live posting health with recommended next actions."
      action={
        <div className="text-xs text-muted-foreground tabular-nums">
          {sorted.length.toLocaleString("en-IN")} rows
        </div>
      }
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterSelect value={location} onChange={setLocation} placeholder="All locations" options={locations} />
        <FilterSelect value={company} onChange={setCompany} placeholder="All companies" options={companies} />
        <FilterSelect value={role} onChange={setRole} placeholder="All roles" options={roles} />
        <Select value={bucket} onValueChange={setBucket}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Apps bucket" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All applications</SelectItem>
            <SelectItem value="0">0</SelectItem>
            <SelectItem value="1-5">1–5</SelectItem>
            <SelectItem value="6-20">6–20</SelectItem>
            <SelectItem value="20+">20+</SelectItem>
          </SelectContent>
        </Select>
        <Select value={freshness} onValueChange={setFreshness}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Job freshness" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All freshness</SelectItem>
            <SelectItem value="latest">{FRESHNESS_LABEL.latest}</SelectItem>
            <SelectItem value="recent">{FRESHNESS_LABEL.recent}</SelectItem>
            <SelectItem value="old">{FRESHNESS_LABEL.old}</SelectItem>
          </SelectContent>
        </Select>
        <FilterSelect value={action} onChange={setAction} placeholder="All actions" options={actions} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead k="title" label="Job Role" />
              <SortHead k="posted_by" label="Company" />
              <SortHead k="area" label="Location" />
              <SortHead k="salary_offered" label="Salary" right />
              <SortHead k="posted_date" label="Posted" />
              <SortHead k="current_openings" label="Openings" right />
              <SortHead k="applications" label="Apps" right />
              <SortHead k="shortlisted" label="Shortlisted" right />
              <TableHead>Freshness</TableHead>
              <TableHead>Pending From</TableHead>
              <TableHead>Action (Provider)</TableHead>
              <TableHead>Action (Seeker)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((j) => {
              const k = `${j.title}|${j.posted_by}|${j.area}|${j.current_openings}`;
              const isDup = (dupeKeys.get(k) ?? 0) > 1;
              const fresh = jobFreshness(j.posted_date);
              return (
                <TableRow
                  key={j.id}
                  className={isDup ? "bg-amber-500/5" : ""}
                  title={isDup ? "Possible duplicate posting" : undefined}
                >
                  <TableCell className="font-medium">
                    {j.title}
                    {isDup && (
                      <Badge variant="outline" className="ml-2 border-amber-500/40 text-amber-700 dark:text-amber-400">
                        duplicate
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{nz(j.posted_by)}</TableCell>
                  <TableCell>{nz(j.area)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtSalary(j.salary_offered)}</TableCell>
                  <TableCell>{fmtDate(j.posted_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(j.current_openings)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(j.applications)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtInt(j.shortlisted)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{FRESHNESS_LABEL[fresh]}</Badge>
                  </TableCell>
                  <TableCell>{nz(j.application_pending_from)}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{nz(j.recommended_action_provider)}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{nz(j.recommended_action_seeker)}</TableCell>
                </TableRow>
              );
            })}
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  No jobs match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {pageSafe} of {totalPages}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={pageSafe <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button size="sm" variant="outline" disabled={pageSafe >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[180px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  UserPlus,
  AlertTriangle,
  PauseCircle,
  Copy,
  CheckCircle2,
  Send,
  TrendingUp,
  Activity,
  RefreshCw,
  Languages,
  Moon,
  Search,
  ChevronDown,
  Upload,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  loadSeekers,
  loadSeekersAsync,
  saveUploadedCsv,
  resetToBundled,
  type Seeker,
  type CsvMeta,
} from "@/lib/upSeekersCsv";

export const Route = createFileRoute("/user-level-analysis")({
  component: UserLevelAnalysis,
});

const STATUS_STYLES: Record<Seeker["status"], string> = {
  New: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Active: "bg-blue-50 text-blue-700 border-blue-200",
  "At Risk": "bg-amber-50 text-amber-700 border-amber-200",
  Inactive: "bg-rose-50 text-rose-700 border-rose-200",
};

function MetricTile({
  label,
  value,
  description,
  Icon,
}: {
  label: string;
  value: string;
  description: string;
  Icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg border bg-muted/40 flex items-center justify-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium leading-tight">{label}</div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function UserLevelAnalysis() {
  const initial = useMemo(() => loadSeekers(), []);
  const [seekers, setSeekers] = useState<Seeker[]>(initial.seekers);
  const [meta, setMeta] = useState<CsvMeta>(initial.meta);
  const [isFetching, setIsFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [profileFilter, setProfileFilter] = useState<string>("all");
  const [appliedFilter, setAppliedFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Seeker | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Hydrate from IndexedDB after mount (SSR-safe)
  useEffect(() => {
    loadSeekersAsync().then(({ seekers: s, meta: m }) => {
      setSeekers(s);
      setMeta(m);
    });
  }, []);

  const refetch = async () => {
    setIsFetching(true);
    const { seekers: s, meta: m } = await loadSeekersAsync();
    setSeekers(s);
    setMeta(m);
    setTimeout(() => setIsFetching(false), 300);
  };

  const handleUploadClick = () => fileRef.current?.click();

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const { seekers: s, meta: m, persisted } = await saveUploadedCsv(file.name, text);
      setSeekers(s);
      setMeta(m);
      if (!persisted) {
        alert(
          `Loaded ${s.length} rows from "${file.name}", but it couldn't be saved to browser storage. It will remain active until you reload the page.`,
        );
      }
    } catch (err) {
      alert("Failed to parse CSV: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = async () => {
    const { seekers: s, meta: m } = await resetToBundled();
    setSeekers(s);
    setMeta(m);
  };




  const stats = useMemo(() => {
    const total = seekers.length;
    const byStatus = { New: 0, Active: 0, "At Risk": 0, Inactive: 0 } as Record<Seeker["status"], number>;
    let complete = 0;
    let withApps = 0;
    let totalApps = 0;
    let totalCompletion = 0;
    const profilesPerUser = new Map<string, number>();
    const usersWithApps = new Set<string>();
    let newLast7 = 0;
    for (const s of seekers) {
      byStatus[s.status]++;
      if (s.profileStatus === "Complete") complete++;
      if (s.applications > 0) withApps++;
      totalApps += s.applications;
      totalCompletion += s.profileCompletion;
      if (s.userId) {
        profilesPerUser.set(s.userId, (profilesPerUser.get(s.userId) ?? 0) + 1);
        if (s.applications > 0) usersWithApps.add(s.userId);
      }
      if (s.profileAge !== null && s.profileAge <= 7) newLast7++;
    }
    const uniqueUsers = profilesPerUser.size;
    let usersMulti = 0;
    for (const count of profilesPerUser.values()) if (count > 1) usersMulti++;
    return {
      total,
      byStatus,
      complete,
      completePct: total ? Math.round((complete / total) * 100) : 0,
      withApps,
      uniqueUsers,
      pctUsersMultiProfile: uniqueUsers ? Math.round((usersMulti / uniqueUsers) * 100) : 0,
      pctUsersWithApps: uniqueUsers ? Math.round((usersWithApps.size / uniqueUsers) * 100) : 0,
      avgAppsPerSeeker: total ? (totalApps / total).toFixed(2) : "0",
      avgCompletion: total ? Math.round(totalCompletion / total) : 0,
      newLast7,
    };
  }, [seekers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return seekers.filter((s) => {
      if (statusFilter !== "all" && s.status.toLowerCase().replace(" ", "-") !== statusFilter) return false;
      if (profileFilter !== "all" && s.profileStatus.toLowerCase() !== profileFilter) return false;
      if (appliedFilter === "applied" && s.applications <= 0) return false;
      if (appliedFilter === "not-applied" && s.applications > 0) return false;
      if (q && !(s.id.toLowerCase().includes(q) || s.userId.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [seekers, search, statusFilter, profileFilter, appliedFilter]);

  const lifecycle = [
    {
      label: "New",
      value: stats.byStatus.New,
      description: "Profile age ≤ 7 days",
      icon: UserPlus,
      accent: "from-emerald-50 to-white",
      iconBg: "bg-white border border-emerald-200",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-600",
    },
    {
      label: "Active",
      value: stats.byStatus.Active,
      description: "Last applied ≤ 30 days",
      icon: Users,
      accent: "from-blue-50 to-white",
      iconBg: "bg-white border border-blue-200",
      iconColor: "text-blue-600",
      valueColor: "text-blue-600",
    },
    {
      label: "At Risk",
      value: stats.byStatus["At Risk"],
      description: "Profile > 7d, last applied 31–90d",
      icon: AlertTriangle,
      accent: "from-amber-50 to-white",
      iconBg: "bg-white border border-amber-200",
      iconColor: "text-amber-500",
      valueColor: "text-amber-600",
    },
    {
      label: "Inactive",
      value: stats.byStatus.Inactive,
      description: "Last applied > 90 days or never",
      icon: PauseCircle,
      accent: "from-rose-50 to-white",
      iconBg: "bg-white border border-rose-200",
      iconColor: "text-rose-500",
      valueColor: "text-rose-600",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Bluedots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discovery &amp; services network for People with Disabilities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChosen}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Sync data
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Source: <span className="font-medium text-foreground">{meta.name}</span>
                <div>{meta.rows.toLocaleString()} rows</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                UP Job Seekers (reload)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleUploadClick()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload new CSV…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleReset()}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to bundled CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>KA Job Seekers</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Participants
          </Button>
          <Button variant="outline" className="gap-2">
            <Languages className="h-4 w-4" />
            English
          </Button>
          <Button variant="outline" size="icon">
            <Moon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Seekers banner */}
      <div className="rounded-xl border bg-card p-5 flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Seekers</div>
            <div className="text-xl font-semibold">
              {stats.total.toLocaleString()} <span className="text-muted-foreground font-normal">total</span>
            </div>
          </div>
        </div>
        <div className="h-10 w-px bg-border" />
        <div className="text-sm text-muted-foreground flex-1">
          Lifecycle and profile health across your network
        </div>
        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Lifecycle cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {lifecycle.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-xl border p-5 bg-gradient-to-br ${c.accent}`}>
              <div className={`h-10 w-10 rounded-lg ${c.iconBg} flex items-center justify-center ${c.iconColor}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={`mt-6 text-5xl font-bold ${c.valueColor}`}>{c.value.toLocaleString()}</div>
              <div className="mt-3 text-base font-semibold">{c.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.description}</div>
            </div>
          );
        })}
      </div>

      {/* Profiles & Users metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">Profiles</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile label="Profiles Registered" value={stats.total.toLocaleString()} description="All seeker records" Icon={Copy} />
            <MetricTile
              label="Profiles Complete"
              value={stats.complete.toLocaleString()}
              description={`${stats.completePct}% of all profiles`}
              Icon={CheckCircle2}
            />
            <MetricTile
              label="Applications"
              value={stats.withApps.toLocaleString()}
              description="Profiles with applications"
              Icon={Send}
            />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">Users</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile label="Total Seekers" value={stats.uniqueUsers.toLocaleString()} description="Unique user IDs" Icon={Users} />
            <MetricTile
              label="% Users > 1 Profile"
              value={`${stats.pctUsersMultiProfile}%`}
              description="Users managing multiple profiles"
              Icon={TrendingUp}
            />
            <MetricTile
              label="% Users with ≥1 Application"
              value={`${stats.pctUsersWithApps}%`}
              description={`${stats.newLast7} new in last 7 days`}
              Icon={Activity}
            />
          </div>
        </div>
      </div>

      {/* Participant table */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 flex items-center gap-3 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Profile ID or User ID..."
              className="pl-9 bg-muted/40 border-0"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={profileFilter} onValueChange={setProfileFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All profiles</SelectItem>
              <SelectItem value="complete">Complete</SelectItem>
              <SelectItem value="incomplete">Incomplete</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="at-risk">At Risk</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground whitespace-nowrap">
            {filtered.length.toLocaleString()} of {stats.total.toLocaleString()}
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead rowSpan={2} className="align-middle">Seeker</TableHead>
                <TableHead rowSpan={2} className="align-middle">Joined</TableHead>
                <TableHead rowSpan={2} className="align-middle">Profile Status</TableHead>
                <TableHead colSpan={4} className="text-center border-l">Applied</TableHead>
                <TableHead colSpan={4} className="text-center border-l">Pre-shortlisted</TableHead>
                <TableHead rowSpan={2} className="align-middle border-l">Status</TableHead>
                <TableHead rowSpan={2} className="align-middle">Recommended Action</TableHead>
              </TableRow>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs uppercase tracking-wider border-l">Total</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Shortlisted</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Rejected</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Pending</TableHead>
                <TableHead className="text-xs uppercase tracking-wider border-l">Total</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Accepted</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Rejected</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, 200).map((p) => {
                const pending = Math.max(0, p.applications - p.shortlisted - p.rejected);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-semibold">
                      <button
                        type="button"
                        onClick={() => setSelected(p)}
                        className="text-left hover:underline text-primary font-mono text-xs"
                      >
                        {p.id}
                      </button>
                      <div className="text-[11px] text-muted-foreground font-normal font-mono mt-0.5">
                        User: {p.userId || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.createdOn || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`rounded-full ${
                          p.profileStatus === "Complete"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                      >
                        {p.profileStatus} ({p.profileCompletion}%)
                      </Badge>
                    </TableCell>
                    <TableCell className="border-l">{p.applications}</TableCell>
                    <TableCell>{p.shortlisted}</TableCell>
                    <TableCell>{p.rejected}</TableCell>
                    <TableCell>{pending}</TableCell>
                    <TableCell className="border-l">0</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell>0</TableCell>
                    <TableCell className="border-l">
                      <Badge variant="outline" className={`rounded-full ${STATUS_STYLES[p.status]}`}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <button className="text-xs px-3 py-1 rounded-full border bg-muted/40 hover:bg-muted transition">
                        {p.recommendedAction}
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-sm text-muted-foreground py-10">
                    No seekers match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {filtered.length > 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Showing first 200 of {filtered.length.toLocaleString()} matches. Refine with search or filter.
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">
              Profile {selected?.id}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              User ID: {selected?.userId || "—"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-10 text-center text-sm text-muted-foreground">
            Profile fields will be shown here once confirmed.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

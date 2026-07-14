import { createFileRoute } from "@tanstack/react-router";
import { Users, UserPlus, AlertTriangle, PauseCircle, Copy, CheckCircle2, Send, TrendingUp, Activity, RefreshCw, Languages, Moon, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/user-level-analysis")({
  component: UserLevelAnalysis,
});

type LifecycleCard = {
  label: string;
  value: string;
  description: string;
  icon: typeof Users;
  accent: string;
  iconBg: string;
  iconColor: string;
  valueColor: string;
};

const LIFECYCLE: LifecycleCard[] = [
  {
    label: "New",
    value: "1",
    description: "Joined within the last 7 days",
    icon: UserPlus,
    accent: "from-emerald-50 to-white",
    iconBg: "bg-white border border-emerald-200",
    iconColor: "text-emerald-600",
    valueColor: "text-emerald-600",
  },
  {
    label: "Active",
    value: "0",
    description: "Connected with a provider in the last 30 days",
    icon: Users,
    accent: "from-emerald-50 to-white",
    iconBg: "bg-white border border-emerald-200",
    iconColor: "text-emerald-600",
    valueColor: "text-emerald-600",
  },
  {
    label: "At Risk",
    value: "0",
    description: "No activity for 30–90 days",
    icon: AlertTriangle,
    accent: "from-amber-50 to-white",
    iconBg: "bg-white border border-amber-200",
    iconColor: "text-amber-500",
    valueColor: "text-amber-600",
  },
  {
    label: "Inactive",
    value: "0",
    description: "No activity 90+ days",
    icon: PauseCircle,
    accent: "from-rose-50 to-white",
    iconBg: "bg-white border border-rose-200",
    iconColor: "text-rose-500",
    valueColor: "text-rose-600",
  },
];

type MetricCard = {
  label: string;
  value: string;
  description: string;
  icon: typeof Users;
};

const PROFILE_METRICS: MetricCard[] = [
  { label: "Profiles Registered", value: "1", description: "All Seekers records", icon: Copy },
  { label: "Profiles Complete", value: "0", description: "0% of all profiles", icon: CheckCircle2 },
  { label: "Made Connections", value: "0", description: "Profiles with submissions", icon: Send },
];

const USER_METRICS: MetricCard[] = [
  { label: "Total Seekers", value: "1", description: "Unique account holders", icon: Users },
  { label: "Avg Profiles per User", value: "1", description: "Profiles managed each", icon: TrendingUp },
  { label: "Avg Actions per User", value: "0", description: "Recorded interactions", icon: Activity },
];

type Participant = {
  name: string;
  joined: string;
  profile: "Complete" | "Incomplete";
  applied: { total: number; shortlisted: number; rejected: number; pending: number };
  preShortlisted: { total: number; accepted: number; rejected: number; pending: number };
  status: "Inactive" | "Active" | "At Risk";
};

const PARTICIPANTS: Participant[] = [
  {
    name: "Deepanjali Dsilva",
    joined: "28 Jan 2026",
    profile: "Complete",
    applied: { total: 1, shortlisted: 1, rejected: 0, pending: 0 },
    preShortlisted: { total: 0, accepted: 0, rejected: 0, pending: 0 },
    status: "Inactive",
  },
  {
    name: "Sajidali Pathan",
    joined: "04 Feb 2026",
    profile: "Complete",
    applied: { total: 0, shortlisted: 0, rejected: 0, pending: 0 },
    preShortlisted: { total: 0, accepted: 0, rejected: 0, pending: 0 },
    status: "Inactive",
  },
  {
    name: "Sapna Sahu",
    joined: "07 Feb 2026",
    profile: "Complete",
    applied: { total: 0, shortlisted: 0, rejected: 0, pending: 0 },
    preShortlisted: { total: 0, accepted: 0, rejected: 0, pending: 0 },
    status: "Inactive",
  },
  {
    name: "Vipashu",
    joined: "07 Feb 2026",
    profile: "Complete",
    applied: { total: 0, shortlisted: 0, rejected: 0, pending: 0 },
    preShortlisted: { total: 0, accepted: 0, rejected: 0, pending: 0 },
    status: "Inactive",
  },
];

function MetricTile({ metric }: { metric: MetricCard }) {
  const Icon = metric.icon;
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg border bg-muted/40 flex items-center justify-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium leading-tight">{metric.label}</div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{metric.value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{metric.description}</div>
    </div>
  );
}

function UserLevelAnalysis() {
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
              1 <span className="text-muted-foreground font-normal">total</span>
            </div>
          </div>
        </div>
        <div className="h-10 w-px bg-border" />
        <div className="text-sm text-muted-foreground flex-1">
          Lifecycle and profile health across your network
        </div>
        <Button variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Lifecycle cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {LIFECYCLE.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.label}
              className={`rounded-xl border p-5 bg-gradient-to-br ${c.accent}`}
            >
              <div className={`h-10 w-10 rounded-lg ${c.iconBg} flex items-center justify-center ${c.iconColor}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className={`mt-6 text-5xl font-bold ${c.valueColor}`}>{c.value}</div>
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
            {PROFILE_METRICS.map((m) => (
              <MetricTile key={m.label} metric={m} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">Users</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {USER_METRICS.map((m) => (
              <MetricTile key={m.label} metric={m} />
            ))}
          </div>
        </div>
      </div>

      {/* Participant table */}
      <div className="rounded-xl border bg-card">
        <div className="p-4 flex items-center gap-3 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search participant..." className="pl-9 bg-muted/40 border-0" />
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="at-risk">At Risk</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead rowSpan={2} className="align-middle">Participant</TableHead>
                <TableHead rowSpan={2} className="align-middle">Joined</TableHead>
                <TableHead rowSpan={2} className="align-middle">Job Profile Details</TableHead>
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
              {PARTICIPANTS.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-semibold">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.joined}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 rounded-full">
                      {p.profile}
                    </Badge>
                  </TableCell>
                  <TableCell className="border-l">{p.applied.total}</TableCell>
                  <TableCell>{p.applied.shortlisted}</TableCell>
                  <TableCell>{p.applied.rejected}</TableCell>
                  <TableCell>{p.applied.pending}</TableCell>
                  <TableCell className="border-l">{p.preShortlisted.total}</TableCell>
                  <TableCell>{p.preShortlisted.accepted}</TableCell>
                  <TableCell>{p.preShortlisted.rejected}</TableCell>
                  <TableCell>{p.preShortlisted.pending}</TableCell>
                  <TableCell className="border-l">
                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 rounded-full">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 items-start">
                      <button className="text-xs px-3 py-1 rounded-full border bg-muted/40 hover:bg-muted transition">Update Location</button>
                      <button className="text-xs px-3 py-1 rounded-full border bg-muted/40 hover:bg-muted transition">Update Contact Details</button>
                      <button className="text-xs px-3 py-1 rounded-full border bg-muted/40 hover:bg-muted transition">Update Role</button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

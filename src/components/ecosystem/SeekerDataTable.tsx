import { useMemo, useState } from "react";
import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Seeker } from "./mockData";
import { fmtInt, fmtSalary, maskName, nz } from "./ecosystemHelpers";

const CAP = 200;

export function SeekerDataTable({ seekers }: { seekers: Seeker[] }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [exp, setExp] = useState("all");
  const [qual, setQual] = useState("all");
  const [trade, setTrade] = useState("all");
  const [org, setOrg] = useState("all");
  const [inst, setInst] = useState("all");

  const opts = useMemo(() => {
    const u = <K extends keyof Seeker>(k: K) =>
      Array.from(new Set(seekers.map((s) => String(s[k] ?? "")))).filter(Boolean).sort();
    return {
      role: u("role"),
      exp: u("experience"),
      qual: u("qualification"),
      trade: u("trade"),
      org: u("organization_name"),
      inst: u("institution_name"),
    };
  }, [seekers]);

  const filtered = seekers.filter((s) => {
    if (role !== "all" && s.role !== role) return false;
    if (exp !== "all" && s.experience !== exp) return false;
    if (qual !== "all" && s.qualification !== qual) return false;
    if (trade !== "all" && s.trade !== trade) return false;
    if (org !== "all" && s.organization_name !== org) return false;
    if (inst !== "all" && s.institution_name !== inst) return false;
    if (q) {
      const t = q.toLowerCase();
      const hay = `${s.name} ${s.area} ${s.role} ${s.skills} ${s.institution_name}`.toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });

  const shown = filtered.slice(0, CAP);

  return (
    <Panel
      title="Seeker Data"
      description={`Showing ${shown.length.toLocaleString("en-IN")} of ${filtered.length.toLocaleString("en-IN")}${filtered.length > CAP ? ` (capped at ${CAP})` : ""}`}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, area, role, skills…"
            className="pl-7 w-[240px]"
          />
        </div>
        <FS value={role} onChange={setRole} placeholder="All roles" options={opts.role} />
        <FS value={exp} onChange={setExp} placeholder="All experience" options={opts.exp} />
        <FS value={qual} onChange={setQual} placeholder="All qualifications" options={opts.qual} />
        <FS value={trade} onChange={setTrade} placeholder="All trades" options={opts.trade} />
        <FS value={org} onChange={setOrg} placeholder="All organisations" options={opts.org} />
        <FS value={inst} onChange={setInst} placeholder="All institutions" options={opts.inst} />
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Experience</TableHead>
              <TableHead>Qualification</TableHead>
              <TableHead>Trade</TableHead>
              <TableHead className="text-right">Salary</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead>Organisation</TableHead>
              <TableHead>Institution</TableHead>
              <TableHead>District</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{maskName(s.name)}</TableCell>
                <TableCell>{nz(s.area)}</TableCell>
                <TableCell>{nz(s.role)}</TableCell>
                <TableCell>{nz(s.experience)}</TableCell>
                <TableCell>{nz(s.qualification)}</TableCell>
                <TableCell>{nz(s.trade)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtSalary(s.expected_salary)}</TableCell>
                <TableCell className="max-w-[200px] truncate">{nz(s.skills)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(s.age)}</TableCell>
                <TableCell>{nz(s.organization_name)}</TableCell>
                <TableCell>{nz(s.institution_name)}</TableCell>
                <TableCell>{nz(s.location_district)}</TableCell>
              </TableRow>
            ))}
            {shown.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  No seekers match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

function FS({
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
      <SelectTrigger className="w-[160px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>{o}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

import { useMemo } from "react";
import { Panel } from "@/components/Panel";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Seeker } from "./mockData";
import { classifyAssociation, classifyInstitutionType, fmtInt } from "./ecosystemHelpers";

export function InstitutionBreakdown({ seekers }: { seekers: Seeker[] }) {
  const rows = useMemo(() => {
    const map = new Map<string, { name: string; type: string; assoc: string; accounts: Set<string>; profiles: number }>();
    for (const s of seekers) {
      const name = (s.institution_name || "").trim();
      if (!name) continue;
      const key = name;
      if (!map.has(key)) {
        map.set(key, {
          name,
          type: classifyInstitutionType(name),
          assoc: classifyAssociation(name),
          accounts: new Set(),
          profiles: 0,
        });
      }
      const r = map.get(key)!;
      r.accounts.add(s.user_id);
      r.profiles += 1;
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, accounts: r.accounts.size }))
      .sort((a, b) => b.profiles - a.profiles);
  }, [seekers]);

  const withoutInst = seekers.filter((s) => !(s.institution_name || "").trim()).length;

  const typeTally = tally(rows, (r) => r.type);
  const assocTally = tally(rows, (r) => r.assoc);

  return (
    <Panel
      title="Institution Breakdown"
      description={`${fmtInt(rows.length)} unique institutions | ${fmtInt(withoutInst)} profiles without institution`}
    >
      <div className="flex flex-wrap gap-4 mb-4 text-xs">
        <TallyGroup title="By Institution Type" tally={typeTally} />
        <TallyGroup title="By Association" tally={assocTally} />
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Institution Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Association</TableHead>
              <TableHead className="text-right">Accounts</TableHead>
              <TableHead className="text-right">Profiles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.name}>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell><Badge variant="outline">{r.type}</Badge></TableCell>
                <TableCell><Badge variant="outline">{r.assoc}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(r.accounts)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(r.profiles)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No institutions for this district.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </Panel>
  );
}

function tally<T>(rows: T[], fn: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = fn(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function TallyGroup({ title, tally }: { title: string; tally: Record<string, number> }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-[11px] font-medium text-muted-foreground">{title}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {Object.entries(tally).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1">
            <Badge variant="outline">{k}</Badge>
            <span className="tabular-nums">{v.toLocaleString("en-IN")}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

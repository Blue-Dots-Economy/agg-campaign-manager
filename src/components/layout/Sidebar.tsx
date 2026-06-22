import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Megaphone,
  Rocket,
  Calendar,
  BarChart3,
  Database,
  Settings,
  Briefcase,
} from "lucide-react";
import { useProgram } from "@/programs/context";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/campaigns", label: "Campaigns", icon: Megaphone },
  { to: "/launch", label: "Launch", icon: Rocket },
  { to: "/schedule", label: "Schedule", icon: Calendar },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/data", label: "Data & uploads", icon: Database },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const { config, programId, setProgramId } = useProgram();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-sidebar-accent flex items-center justify-center">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[15px] font-semibold leading-tight">Operation Rozgar</div>
            <div className="text-[11px] opacity-80 leading-tight mt-0.5">{config.subtitle}</div>
          </div>
        </div>

        <div className="mt-5 inline-flex rounded-lg bg-sidebar-accent p-1 w-full">
          {(["kkb", "dkb"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setProgramId(id)}
              className={cn(
                "flex-1 text-xs font-medium py-1.5 rounded-md uppercase tracking-wide transition-colors",
                programId === id
                  ? "bg-white text-sidebar"
                  : "text-sidebar-foreground/80 hover:text-sidebar-foreground"
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {NAV.map((item) => {
          const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/85 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border text-[11px] opacity-85">
        Connected: {config.sheetLabel} ·{" "}
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          connected
        </span>
      </div>
    </aside>
  );
}

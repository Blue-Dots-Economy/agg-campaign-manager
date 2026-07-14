import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Megaphone,
  Rocket,
  Settings,
  Headphones,
  Users,
  Menu,
  LogOut,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    title: "Program, Ops & Biz",
    items: [
      { to: "/user-level-analysis", label: "User Overview", sub: undefined, icon: Users },
      { to: "/review", label: "Transcript & Call Review", sub: undefined, icon: Headphones },
      { to: "/launch", label: "Launch A Campaign", sub: undefined, icon: Rocket },
    ],
  },
  {
    title: "Product & Tech",
    items: [
      { to: "/", label: "Campaign Analysis", sub: "Make it Bot & Campaign Overview", icon: LayoutDashboard },
      { to: "/campaigns", label: "Campaign Level Analysis", sub: undefined, icon: Megaphone },
    ],
  },
] as const;

const SETTINGS = { to: "/settings", label: "Settings", icon: Settings } as const;

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const { programId, setProgramId } = useProgram();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3">
          <SheetTitle className="sr-only">Menu</SheetTitle>
        </SheetHeader>

        <div className="px-5 pb-4">
          <div role="group" aria-label="Select program" className="inline-flex rounded-lg bg-muted p-1 w-full">
            {(["kkb", "dkb"] as const).map((id) => (
              <button
                key={id}
                onClick={() => setProgramId(id)}
                aria-pressed={programId === id}
                aria-label={`Show ${id.toUpperCase()} program`}
                className={cn(
                  "flex-1 text-xs font-medium py-1.5 rounded-md uppercase tracking-wide transition-colors",
                  programId === id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </div>

        <nav className="px-3 py-1 space-y-0.5">
          {NAV.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-foreground/85 hover:bg-accent/70"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t px-5 py-4">
          <button
            onClick={() => { setOpen(false); logout(); navigate({ to: "/login" }); }}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

import { Upload, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/programs/context";
import { Link } from "@tanstack/react-router";

export function TopBar() {
  const { config } = useProgram();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b bg-background">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hello, Aryan</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Here's how {config.label} is performing
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft text-brand px-3 py-1 text-xs font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          {config.label} program
        </span>
        <Link to="/launch">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="h-4 w-4" /> Upload CSV
          </Button>
        </Link>
        <Link to="/launch">
          <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
            <Rocket className="h-4 w-4" /> Launch campaign
          </Button>
        </Link>
      </div>
    </header>
  );
}

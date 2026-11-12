import { Link, useRouterState } from "@tanstack/react-router";
import {
  AudioWaveform,
  Layers,
  LayoutDashboard,
  Map as MapIcon,
  Menu,
  Quote,
  Sparkles,
  Upload,
  UserX,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/store";
import { useRunState } from "@/lib/run-store";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Data Upload", icon: Upload },
  { to: "/analysis", label: "AI Analysis", icon: Sparkles },
  { to: "/themes", label: "Theme Clustering", icon: Layers },
  { to: "/churn", label: "Churn Detection", icon: UserX },
  { to: "/roadmap", label: "Product Roadmap", icon: MapIcon },
  { to: "/quotes", label: "Customer Quotes", icon: Quote },
] as const;

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-2">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-brand text-primary-foreground shadow-glow">
        <AudioWaveform className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block font-display text-[13px] font-bold tracking-[0.08em] text-foreground">VOICE OF</span>
        <span className="block font-display text-[13px] font-bold tracking-[0.08em] text-gradient-brand">COPILOT</span>
      </span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((n) => {
        const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspaceStatus() {
  const { feedback, dedupe, analysis, hasSample, stale } = useDataset();
  const run = useRunState();
  const status =
    run.status === "running"
      ? { label: "Analyzing…", cls: "bg-primary animate-pulse" }
      : !analysis
        ? { label: "Not analyzed", cls: "bg-muted-foreground/40" }
        : stale
          ? { label: "Out of date", cls: "bg-warning" }
          : { label: "Insights ready", cls: "bg-positive" };
  return (
    <div className="rounded-xl border bg-card p-3 text-xs">
      <p className="font-semibold text-foreground">Workspace</p>
      <div className="mt-2 space-y-1 text-muted-foreground">
        <p>
          {feedback.length} items · {dedupe.unique.length} unique
        </p>
        <p className="flex items-center gap-1.5">
          <span className={cn("size-1.5 rounded-full", status.cls)} />
          {status.label}
        </p>
        {hasSample && <p className="text-violet">Includes synthetic sample</p>}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar px-4 py-6 lg:flex">
        <Brand />
        <p className="mt-3 px-2 text-[11px] leading-snug text-muted-foreground">Feedback intelligence for product teams</p>
        <div className="mt-8 flex-1">
          <NavList />
        </div>
        <WorkspaceStatus />
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 bg-sidebar p-5">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand />
            <div className="mt-8">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-8">
              <WorkspaceStatus />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">{children}</div>
      </main>
    </div>
  );
}

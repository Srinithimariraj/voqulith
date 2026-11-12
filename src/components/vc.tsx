import { Link } from "@tanstack/react-router";
import { AlertTriangle, Database, FlaskConical, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useDataset } from "@/lib/store";
import type { Priority, RiskLevel, Sentiment, Severity } from "@/lib/types";

/* ---------- layout ---------- */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5 shadow-card md:p-6", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "primary" | "violet" | "negative" | "positive" | "warning";
}) {
  const toneCls = {
    primary: "bg-primary-soft text-primary",
    violet: "bg-violet-soft text-violet",
    negative: "bg-negative-soft text-negative",
    positive: "bg-positive-soft text-positive",
    warning: "bg-warning-soft text-warning",
  }[tone];
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && <span className={cn("grid size-8 place-items-center rounded-lg [&_svg]:size-4", toneCls)}>{icon}</span>}
      </div>
      <p className="mt-3 font-display text-3xl font-semibold text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ---------- pills ---------- */

type Tone = "positive" | "negative" | "neutral" | "mixed" | "warning" | "critical" | "primary" | "violet";
const TONE: Record<Tone, string> = {
  positive: "bg-positive-soft text-positive",
  negative: "bg-negative-soft text-negative",
  neutral: "bg-neutral-soft text-neutral",
  mixed: "bg-mixed-soft text-mixed",
  warning: "bg-warning-soft text-warning",
  critical: "bg-critical-soft text-critical",
  primary: "bg-primary-soft text-primary",
  violet: "bg-violet-soft text-violet",
};

export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const SENTIMENT_TONE: Record<Sentiment, Tone> = {
  positive: "positive",
  negative: "negative",
  neutral: "neutral",
  mixed: "mixed",
};
export function SentimentPill({ value }: { value: Sentiment }) {
  return <Pill tone={SENTIMENT_TONE[value]}>{value}</Pill>;
}
export function SeverityPill({ value }: { value: Severity }) {
  const tone: Record<Severity, Tone> = { critical: "critical", high: "negative", medium: "warning", low: "neutral" };
  return <Pill tone={tone[value]}>{value}</Pill>;
}
export function RiskPill({ value }: { value: RiskLevel }) {
  const tone: Record<RiskLevel, Tone> = { high: "critical", medium: "warning", low: "neutral" };
  return <Pill tone={tone[value]}>{value} risk</Pill>;
}
export function PriorityPill({ value }: { value: Priority }) {
  const tone: Record<Priority, Tone> = { P0: "critical", P1: "warning", P2: "primary" };
  return (
    <Pill tone={tone[value]} className="font-mono uppercase">
      {value}
    </Pill>
  );
}
export function SyntheticPill() {
  return (
    <Pill tone="violet" className="normal-case">
      <FlaskConical className="size-3" /> Synthetic sample
    </Pill>
  );
}

export function Confidence({ value, label = true }: { value: number; label?: boolean }) {
  const pct = Math.round(value * 100);
  const word = value >= 0.75 ? "High" : value >= 0.5 ? "Medium" : "Low";
  return (
    <div className="flex items-center gap-2" title={`Model-reported confidence ${pct}%`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${pct}%` }} />
      </div>
      {label && (
        <span className="text-[11px] font-medium text-muted-foreground">
          {word} · {pct}%
        </span>
      )}
    </div>
  );
}

/* ---------- evidence ---------- */

export function FeedbackRef({ id }: { id: string }) {
  const { byId } = useDataset();
  const item = byId.get(id);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {id}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        {item ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">{item.id}</span>
              <Pill tone="primary" className="normal-case">{item.source}</Pill>
              {item.origin === "sample" && <SyntheticPill />}
            </div>
            <p className="leading-relaxed text-foreground">“{item.text}”</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>Customer: {item.customer || "Unidentified"}</span>
              {item.date && <span>Date: {item.date}</span>}
              {item.rating != null && <span>Rating: {item.rating}</span>}
              <span className="capitalize">Via: {item.origin}</span>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">This feedback is no longer in your dataset.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function EvidenceList({ ids, max = 8 }: { ids: string[]; max?: number }) {
  const shown = ids.slice(0, max);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((id) => (
        <FeedbackRef key={id} id={id} />
      ))}
      {ids.length > max && <span className="text-[11px] text-muted-foreground">+{ids.length - max} more</span>}
    </div>
  );
}

/* ---------- states ---------- */

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed bg-gradient-subtle px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary [&_svg]:size-6">
        {icon ?? <Sparkles />}
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

export function NeedsAnalysis({ what }: { what: string }) {
  const { feedback } = useDataset();
  if (feedback.length === 0) {
    return (
      <EmptyState
        icon={<Database />}
        title="No feedback yet"
        description={`Upload feedback or load the synthetic Zomato sample, then run the AI analysis to see ${what}.`}
      >
        <Button asChild variant="brand">
          <Link to="/upload">Add feedback</Link>
        </Button>
      </EmptyState>
    );
  }
  return (
    <EmptyState
      title="Run the AI analysis first"
      description={`You have ${feedback.length} feedback items ready. Run the analysis to see ${what}.`}
    >
      <Button asChild variant="brand">
        <Link to="/analysis">
          <Sparkles /> Go to AI Analysis
        </Link>
      </Button>
    </EmptyState>
  );
}

export function StaleBanner() {
  const { stale } = useDataset();
  if (!stale) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-foreground">
        <AlertTriangle className="size-4 shrink-0 text-warning" />
        Your feedback changed since this analysis ran. Results below reflect the earlier dataset.
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/analysis">Re-run analysis</Link>
      </Button>
    </div>
  );
}

export function SampleNotice() {
  const { hasSample } = useDataset();
  if (!hasSample) return null;
  return (
    <div className="mb-6 flex items-start gap-2 rounded-xl border border-violet/20 bg-violet-soft px-4 py-3 text-xs text-foreground">
      <FlaskConical className="mt-0.5 size-4 shrink-0 text-violet" />
      <span>
        This workspace includes <strong>synthetic Zomato sample data</strong> written for demonstration. It is not real
        customer feedback.
      </span>
    </div>
  );
}

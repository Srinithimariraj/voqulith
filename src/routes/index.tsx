import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertOctagon,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  FlaskConical,
  Layers,
  Loader2,
  MessagesSquare,
  Sparkles,
  Target,
  Upload,
  UserX,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { HorizontalBars, SentimentDonut } from "@/components/charts";
import {
  Confidence,
  EvidenceList,
  FeedbackRef,
  PageHeader,
  Panel,
  PriorityPill,
  RiskPill,
  SampleNotice,
  SeverityPill,
  StaleBanner,
  StatCard,
} from "@/components/vc";
import { useAnalysisRunner } from "@/hooks/use-analysis-runner";
import { loadSampleData, useDataset } from "@/lib/store";
import { CHURN_TYPE_LABEL } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — VOICE OF COPILOT" },
      {
        name: "description",
        content: "Customer feedback dashboard: total feedback, pain points, themes, churn risks and sentiment at a glance.",
      },
      { property: "og:title", content: "VOICE OF COPILOT — Feedback intelligence for PMs" },
      {
        property: "og:description",
        content: "Turn reviews, tickets and surveys into evidence-backed product decisions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { feedback, dedupe, analysis } = useDataset();
  const runner = useAnalysisRunner();

  if (feedback.length === 0) return <Welcome />;

  const sourceCounts = Object.entries(
    dedupe.unique.reduce<Record<string, number>>((acc, f) => {
      acc[f.source] = (acc[f.source] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const highRisk = analysis?.churnSignals.filter((c) => c.risk === "high") ?? [];
  const churnCustomers = new Set(analysis?.churnSignals.map((c) => c.customer ?? c.feedbackId) ?? []).size;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title="Voice of the customer"
        description="A live view of what customers are telling you, grounded in their own words."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/upload">
                <Upload /> Add feedback
              </Link>
            </Button>
            <Button variant="brand" onClick={runner.run} disabled={runner.status === "running"}>
              {runner.status === "running" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {runner.status === "running" ? "Analyzing…" : analysis ? "Re-run analysis" : "Analyze feedback"}
            </Button>
          </>
        }
      />
      <SampleNotice />
      <StaleBanner />
      {runner.status === "error" && runner.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>The analysis didn't complete</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {runner.error}
              {analysis ? " Your previous results are still shown below." : ""}
            </span>
            <Button size="sm" variant="outline" className="w-fit shrink-0" onClick={runner.run}>
              <RefreshCw /> Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-5">
        <StatCard
          label="Total feedback"
          value={feedback.length}
          hint={`${dedupe.unique.length} unique · ${feedback.length - dedupe.unique.length} duplicates`}
          icon={<MessagesSquare />}
        />
        <StatCard
          label="Pain points"
          value={analysis ? analysis.painPoints.length : "—"}
          hint={analysis ? `${analysis.painPoints.filter((p) => p.severity === "critical" || p.severity === "high").length} high or critical` : "Run analysis"}
          icon={<AlertOctagon />}
          tone="negative"
        />
        <StatCard
          label="Themes"
          value={analysis ? analysis.themes.length : "—"}
          hint={analysis?.themes[0] ? `Top: ${analysis.themes[0].name}` : "Run analysis"}
          icon={<Layers />}
          tone="violet"
        />
        <StatCard
          label="Churn risks"
          value={analysis ? churnCustomers : "—"}
          hint={analysis ? `${highRisk.length} high-risk signals` : "Run analysis"}
          icon={<UserX />}
          tone="warning"
        />
        <StatCard
          label="Roadmap items"
          value={analysis ? analysis.recommendations.length : "—"}
          hint={analysis ? `${analysis.recommendations.filter((r) => r.priority === "P0").length} at P0` : "Run analysis"}
          icon={<Target />}
          tone="positive"
        />
      </div>

      {!analysis ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col justify-center rounded-2xl border bg-gradient-hero p-8 shadow-card">
            <Sparkles className="size-8 text-primary" />
            <h2 className="mt-4 text-xl font-semibold text-foreground">Your feedback is ready for analysis</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Run the AI analysis to surface sentiment, themes, pain points, churn risks and roadmap recommendations — each linked
              back to the original feedback.
            </p>
            <Button className="mt-6 w-fit" variant="brand" onClick={runner.run} disabled={runner.status === "running"}>
              {runner.status === "running" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {runner.status === "running" ? "Analyzing…" : "Analyze feedback"}
            </Button>
          </div>
          <Panel title="Feedback by source" description="Unique items">
            <HorizontalBars data={sourceCounts} />
          </Panel>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
            <Panel title="Sentiment" description="Distribution across unique feedback">
              <SentimentDonut sentiment={analysis.sentiment} />
            </Panel>
            <Panel
              title="Themes by volume"
              description="Unique feedback items per theme"
              action={<More to="/themes" />}
            >
              <HorizontalBars data={analysis.themes.slice(0, 8).map((t) => ({ name: t.name, value: t.count }))} />
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Panel
              title="Executive summary"
              action={<More to="/analysis" label="Full analysis" />}
            >
              <p className="text-sm leading-relaxed text-foreground">{analysis.executiveSummary.summary}</p>
              {analysis.executiveSummary.keyFindings.length > 0 && (
                <ul className="mt-4 space-y-2.5">
                  {analysis.executiveSummary.keyFindings.slice(0, 3).map((f, i) => (
                    <li key={i} className="rounded-xl bg-muted px-3 py-2.5">
                      <p className="text-xs text-foreground">{f.text}</p>
                      {f.evidenceIds.length > 0 && (
                        <div className="mt-1.5">
                          <EvidenceList ids={f.evidenceIds} max={5} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel
              title={
                <span className="flex items-center gap-2">
                  <ShieldCheck className="size-4 text-positive" /> Confidence & evidence
                </span>
              }
              action={<Confidence value={analysis.executiveSummary.confidence} />}
            >
              <ul className="space-y-1.5 text-xs">
                <li className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Quotes verified word-for-word</span>
                  <span className="font-mono font-semibold text-foreground">
                    {analysis.verification.quotesProposed - analysis.verification.quotesRejected}/
                    {analysis.verification.quotesProposed}
                  </span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Duplicates not double-counted</span>
                  <span className="font-mono font-semibold text-foreground">{analysis.totals.duplicatesExcluded}</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Unsupported insights removed</span>
                  <span className="font-mono font-semibold text-foreground">
                    {analysis.verification.insightsDroppedNoEvidence + analysis.verification.churnRejected}
                  </span>
                </li>
              </ul>
              <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Limitations
              </p>
              {analysis.executiveSummary.limitations.length ? (
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-foreground">
                  {analysis.executiveSummary.limitations.slice(0, 4).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-xs text-muted-foreground">None stated.</p>
              )}
            </Panel>
          </div>

          <Panel className="mt-6" title="Theme frequencies" description="Share of unique feedback · customers are distinct people" action={<More to="/themes" />}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-semibold">Theme</th>
                    <th className="pb-2 text-right font-semibold">Feedback</th>
                    <th className="pb-2 text-right font-semibold">Customers</th>
                    <th className="w-1/3 pb-2 pl-6 font-semibold">Share</th>
                    <th className="pb-2 text-right font-semibold">Severity</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {analysis.themes.map((t) => (
                    <tr key={t.id}>
                      <td className="py-2.5 pr-3 font-medium text-foreground">{t.name}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-foreground">{t.count}</td>
                      <td className="py-2.5 text-right font-mono text-xs text-foreground">{t.customers}</td>
                      <td className="py-2.5 pl-6">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-gradient-brand" style={{ width: `${Math.min(100, t.percentage)}%` }} />
                          </div>
                          <span className="w-12 text-right font-mono text-xs text-muted-foreground">{t.percentage}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <SeverityPill value={t.severity} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Panel title="Top pain points" action={<More to="/themes" />}>
              <ul className="space-y-3">
                {analysis.painPoints.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{p.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.frequency} mentions · {p.customers} customers
                      </p>
                    </div>
                    <SeverityPill value={p.severity} />
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Churn watchlist" action={<More to="/churn" />}>
              <ul className="space-y-3">
                {analysis.churnSignals.slice(0, 5).map((c) => (
                  <li key={`${c.feedbackId}-${c.type}`} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RiskPill value={c.risk} />
                      <FeedbackRef id={c.feedbackId} />
                    </div>
                    <p className="text-xs text-muted-foreground">{CHURN_TYPE_LABEL[c.type]}</p>
                  </li>
                ))}
                {analysis.churnSignals.length === 0 && <p className="text-sm text-muted-foreground">No churn signals.</p>}
              </ul>
            </Panel>
            <Panel title="Roadmap priorities" action={<More to="/roadmap" />}>
              <ul className="space-y-3">
                {analysis.recommendations.slice(0, 5).map((r) => (
                  <li key={r.id} className="flex items-start gap-2.5">
                    <PriorityPill value={r.priority} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{r.title}</p>
                      <p className="text-[11px] text-muted-foreground">{r.affectedCustomers} customers affected</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel className="mt-6" title="Feedback by source" description="Unique items">
            <HorizontalBars data={sourceCounts} />
          </Panel>
        </>
      )}
    </>
  );
}

function More({ to, label = "View all" }: { to: "/themes" | "/churn" | "/roadmap" | "/analysis"; label?: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="text-primary">
      <Link to={to}>
        {label} <ArrowRight />
      </Link>
    </Button>
  );
}

function Welcome() {
  return (
    <div className="overflow-hidden rounded-3xl border bg-gradient-hero p-8 shadow-card md:p-14">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Customer feedback intelligence</p>
      <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight text-foreground md:text-5xl">
        Hear what customers <span className="text-gradient-brand">really</span> need — with the receipts.
      </h1>
      <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">
        VOICE OF COPILOT turns reviews, support tickets, surveys and screenshots into themes, churn risks and a prioritised
        roadmap. Every insight links back to the customer's original words.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="brand" size="lg">
          <Link to="/upload">
            <Upload /> Upload feedback
          </Link>
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => toast.success(`Loaded ${loadSampleData()} synthetic Zomato feedback items`)}
        >
          <FlaskConical /> Try the synthetic Zomato sample
        </Button>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          { t: "Grounded in evidence", d: "Quotes are verified word-for-word; unsupported insights are dropped." },
          { t: "Duplicate-aware", d: "Repeated posts are collapsed so one customer isn't counted twice." },
          { t: "Built for decisions", d: "P0/P1/P2 recommendations with impact, evidence and next steps." },
        ].map((f) => (
          <div key={f.t} className="rounded-2xl border bg-card/80 p-5">
            <p className="text-sm font-semibold text-foreground">{f.t}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

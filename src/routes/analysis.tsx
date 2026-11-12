import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SentimentDonut } from "@/components/charts";
import {
  Confidence,
  EmptyState,
  EvidenceList,
  FeedbackRef,
  PageHeader,
  Panel,
  PriorityPill,
  RiskPill,
  SampleNotice,
  SentimentPill,
  SeverityPill,
  StaleBanner,
} from "@/components/vc";
import { MAX_ANALYSIS_ITEMS, useAnalysisRunner } from "@/hooks/use-analysis-runner";
import { useDataset } from "@/lib/store";
import { CHURN_TYPE_LABEL } from "@/lib/types";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "AI Analysis — VOICE OF COPILOT" },
      {
        name: "description",
        content: "Gemini-powered sentiment, pain point, theme, churn and roadmap analysis grounded in original feedback.",
      },
      { property: "og:title", content: "AI Analysis — VOICE OF COPILOT" },
      { property: "og:description", content: "Evidence-backed AI analysis of customer feedback." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalysisPage,
});

const STEPS = [
  "Removing duplicate feedback",
  "Reading every feedback item",
  "Scoring sentiment",
  "Clustering themes & pain points",
  "Detecting churn signals",
  "Drafting roadmap recommendations",
  "Verifying quotes against originals",
];

function RunningState({ startedAt, count }: { startedAt: number | null; count: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const elapsed = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
  const step = Math.min(STEPS.length - 1, Math.floor(elapsed / 6));
  return (
    <div className="rounded-2xl border bg-gradient-hero p-8 shadow-card">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-primary" />
        <p className="font-display text-lg font-semibold text-foreground">Analyzing {count} unique feedback items…</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Usually takes 20–90 seconds. You can browse other pages meanwhile. · {elapsed}s</p>
      <div className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-brand animate-shimmer-bar" />
      </div>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 text-sm">
            {i < step ? (
              <CheckCircle2 className="size-4 text-positive" />
            ) : i === step ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <span className="size-4 rounded-full border" />
            )}
            <span className={i <= step ? "text-foreground" : "text-muted-foreground"}>{s}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[11px] text-muted-foreground">Progress steps are indicative; the analysis runs as a single AI request.</p>
    </div>
  );
}

function AnalysisPage() {
  const { analysis, feedback, dedupe, stale } = useDataset();
  const runner = useAnalysisRunner();
  const running = runner.status === "running";
  const overLimit = dedupe.unique.length > MAX_ANALYSIS_ITEMS;

  return (
    <>
      <PageHeader
        eyebrow="AI Analysis"
        title="Feedback intelligence"
        description={
          <>
            Gemini reads every unique feedback item and returns structured insights. Each claim links to feedback IDs;
            quotes are checked word-for-word against the originals before they're shown.
          </>
        }
        actions={
          <Button variant="brand" size="lg" onClick={runner.run} disabled={running || feedback.length === 0}>
            {running ? <Loader2 className="animate-spin" /> : analysis ? <RefreshCw /> : <Sparkles />}
            {running ? "Analyzing…" : analysis ? "Re-run analysis" : "Analyze feedback"}
          </Button>
        }
      />
      <SampleNotice />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <MiniStat label="Feedback items" value={feedback.length} />
        <MiniStat label="Unique after de-duplication" value={dedupe.unique.length} />
        <MiniStat label="Duplicates excluded" value={feedback.length - dedupe.unique.length} />
      </div>

      {overLimit && (
        <Alert className="mb-6">
          <Info className="size-4" />
          <AlertTitle>Large dataset</AlertTitle>
          <AlertDescription>
            Only the first {MAX_ANALYSIS_ITEMS} unique items will be analyzed in one run.
          </AlertDescription>
        </Alert>
      )}

      {runner.status === "error" && runner.error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="size-4" />
          <AlertTitle>The analysis didn't complete</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>{runner.error}</span>
            <Button size="sm" variant="outline" className="w-fit" onClick={runner.run}>
              <RefreshCw /> Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {running && (
        <div className="mb-8">
          <RunningState startedAt={runner.startedAt} count={Math.min(dedupe.unique.length, MAX_ANALYSIS_ITEMS)} />
        </div>
      )}

      {!analysis && !running && (
        <EmptyState
          title={feedback.length ? "Ready to analyze" : "No feedback to analyze"}
          description={
            feedback.length
              ? `Click Analyze to send ${dedupe.unique.length} unique feedback items to Gemini for a full analysis.`
              : "Upload feedback or load the synthetic Zomato sample first."
          }
        >
          {feedback.length ? (
            <Button variant="brand" onClick={runner.run}>
              <Sparkles /> Analyze feedback
            </Button>
          ) : (
            <Button asChild variant="brand">
              <Link to="/upload">Add feedback</Link>
            </Button>
          )}
        </EmptyState>
      )}

      {analysis && (
        <div className={running ? "pointer-events-none opacity-50" : ""}>
          {stale && <StaleBanner />}
          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Executive summary"
              description={`Generated ${new Date(analysis.createdAt).toLocaleString()} · ${analysis.model}`}
              action={<Confidence value={analysis.executiveSummary.confidence} />}
            >
              <p className="text-[15px] leading-relaxed text-foreground">{analysis.executiveSummary.summary}</p>
              {analysis.executiveSummary.keyFindings.length > 0 && (
                <ul className="mt-5 space-y-3">
                  {analysis.executiveSummary.keyFindings.map((f, i) => (
                    <li key={i} className="rounded-xl bg-muted px-4 py-3">
                      <p className="text-sm text-foreground">{f.text}</p>
                      {f.evidenceIds.length > 0 ? (
                        <div className="mt-2">
                          <EvidenceList ids={f.evidenceIds} max={6} />
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-warning">No linked evidence — treat as interpretation.</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <NoteList title="Assumptions" items={analysis.executiveSummary.assumptions} />
                <NoteList title="Limitations & uncertainty" items={analysis.executiveSummary.limitations} />
              </div>
            </Panel>

            <div className="space-y-6">
              <Panel title="Sentiment distribution" description="Unique feedback, one vote per item">
                <SentimentDonut sentiment={analysis.sentiment} />
              </Panel>
              <VerificationPanel />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel
              title="Pain points"
              description="Frequency = unique feedback items · customers = distinct people"
              action={<LinkMore to="/themes" />}
            >
              <div className="space-y-3">
                {analysis.painPoints.slice(0, 6).map((p) => (
                  <div key={p.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{p.title}</p>
                      <SeverityPill value={p.severity} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{p.frequency}</strong> mentions
                      </span>
                      <span>
                        <strong className="text-foreground">{p.customers}</strong> customers
                      </span>
                    </div>
                    <div className="mt-2">
                      <EvidenceList ids={p.feedbackIds} max={6} />
                    </div>
                  </div>
                ))}
                {analysis.painPoints.length === 0 && <p className="text-sm text-muted-foreground">No pain points identified.</p>}
              </div>
            </Panel>

            <div className="space-y-6">
              <Panel title="Churn signals" description="Evidence verified against original text" action={<LinkMore to="/churn" />}>
                <div className="space-y-2.5">
                  {analysis.churnSignals.slice(0, 4).map((c) => (
                    <div key={`${c.feedbackId}-${c.type}`} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <RiskPill value={c.risk} />
                        <span className="text-xs font-medium text-foreground">{CHURN_TYPE_LABEL[c.type]}</span>
                        <FeedbackRef id={c.feedbackId} />
                      </div>
                      <p className="mt-2 text-sm italic text-foreground">“{c.evidence}”</p>
                    </div>
                  ))}
                  {analysis.churnSignals.length === 0 && <p className="text-sm text-muted-foreground">No churn signals detected.</p>}
                </div>
              </Panel>
              <Panel title="Top recommendations" action={<LinkMore to="/roadmap" />}>
                <div className="space-y-2.5">
                  {analysis.recommendations.slice(0, 4).map((r) => (
                    <div key={r.id} className="flex items-start gap-3 rounded-xl border p-3">
                      <PriorityPill value={r.priority} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{r.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.affectedCustomers} customers · {r.feedbackCount} feedback items
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <Panel className="mt-6" title="Themes at a glance" action={<LinkMore to="/themes" />}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {analysis.themes.map((t) => (
                <div key={t.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <span className="font-display text-lg font-semibold text-foreground">{t.percentage}%</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <SentimentPill value={t.sentiment} />
                    <SeverityPill value={t.severity} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t.count} items · {t.customers} customers
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-card">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function NoteList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-dashed p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {items.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-foreground">
          {items.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">None stated.</p>
      )}
    </div>
  );
}

function VerificationPanel() {
  const { analysis } = useDataset();
  if (!analysis) return null;
  const v = analysis.verification;
  const rows = [
    { label: "Quotes verified verbatim", value: `${v.quotesProposed - v.quotesRejected}/${v.quotesProposed}` },
    { label: "Churn evidence verified", value: `${v.churnProposed - v.churnRejected}/${v.churnProposed}` },
    { label: "Unknown feedback IDs removed", value: v.unknownIdsRemoved },
    { label: "Insights dropped (no evidence)", value: v.insightsDroppedNoEvidence },
    { label: "Duplicates excluded", value: analysis.totals.duplicatesExcluded },
  ];
  return (
    <Panel title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-positive" /> Grounding check</span>} description="Anything the AI couldn't back with original feedback is removed.">
      <ul className="space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span className="text-muted-foreground">{r.label}</span>
            <span className="font-mono text-xs font-semibold text-foreground">{r.value}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">
        {analysis.totals.customersIdentified} of {analysis.totals.customers} customers have an ID; unidentified feedback is
        counted as one customer each (assumption).
      </p>
    </Panel>
  );
}

function LinkMore({ to }: { to: "/themes" | "/churn" | "/roadmap" | "/quotes" }) {
  return (
    <Button asChild variant="ghost" size="sm" className="text-primary">
      <Link to={to}>
        View all <ArrowRight />
      </Link>
    </Button>
  );
}

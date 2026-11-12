import { createFileRoute } from "@tanstack/react-router";
import { HorizontalBars } from "@/components/charts";
import {
  Confidence,
  EvidenceList,
  FeedbackRef,
  NeedsAnalysis,
  PageHeader,
  Panel,
  SampleNotice,
  SentimentPill,
  SeverityPill,
  StaleBanner,
} from "@/components/vc";
import { useDataset } from "@/lib/store";

export const Route = createFileRoute("/themes")({
  head: () => ({
    meta: [
      { title: "Theme Clustering — VOICE OF COPILOT" },
      { name: "description", content: "Feedback themes with counts, percentages, sentiment, severity and original quotes." },
      { property: "og:title", content: "Theme Clustering — VOICE OF COPILOT" },
      { property: "og:description", content: "See what customers talk about most, with their own words." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ThemesPage,
});

function ThemesPage() {
  const { analysis } = useDataset();
  return (
    <>
      <PageHeader
        eyebrow="Theme Clustering"
        title="What customers talk about"
        description="Counts and percentages use unique feedback (duplicates removed). Customers counts distinct people."
      />
      <SampleNotice />
      {!analysis ? (
        <NeedsAnalysis what="theme clusters" />
      ) : (
        <>
          <StaleBanner />
          <Panel title="Theme volume" className="mb-6">
            <HorizontalBars data={analysis.themes.map((t) => ({ name: t.name, value: t.count }))} />
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            {analysis.themes.map((t) => {
              const quotes = analysis.quotes.filter((q) => q.themeId === t.id);
              const pains = analysis.painPoints.filter((p) => p.themeId === t.id);
              return (
                <Panel key={t.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[11px] text-muted-foreground">{t.id}</p>
                      <h2 className="text-lg font-semibold text-foreground">{t.name}</h2>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-3xl font-semibold text-gradient-brand">{t.percentage}%</p>
                      <p className="text-[11px] text-muted-foreground">of unique feedback</p>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{t.description}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Feedback" value={t.count} />
                    <Metric label="Customers" value={t.customers} />
                    <div>
                      <p className="text-[11px] text-muted-foreground">Sentiment</p>
                      <div className="mt-1"><SentimentPill value={t.sentiment} /></div>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Severity</p>
                      <div className="mt-1"><SeverityPill value={t.severity} /></div>
                    </div>
                  </div>
                  {pains.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-foreground">Pain points</p>
                      <ul className="mt-1.5 space-y-1">
                        {pains.map((p) => (
                          <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="text-foreground">{p.title}</span>
                            <span className="text-muted-foreground">{p.frequency}×</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold text-foreground">Original quotes</p>
                    {quotes.length === 0 && <p className="text-xs text-muted-foreground">No verified quotes for this theme.</p>}
                    {quotes.map((q, i) => (
                      <blockquote key={i} className="rounded-xl border-l-2 border-primary bg-muted px-4 py-3">
                        <p className="text-sm italic text-foreground">“{q.quote}”</p>
                        <div className="mt-1.5"><FeedbackRef id={q.feedbackId} /></div>
                      </blockquote>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                    <EvidenceList ids={t.feedbackIds} max={10} />
                    <Confidence value={t.confidence} />
                  </div>
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

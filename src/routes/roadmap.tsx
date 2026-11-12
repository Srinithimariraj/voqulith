import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import {
  Confidence,
  EvidenceList,
  NeedsAnalysis,
  PageHeader,
  Panel,
  PriorityPill,
  SampleNotice,
  StaleBanner,
} from "@/components/vc";
import { useDataset } from "@/lib/store";
import type { Priority } from "@/lib/types";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: "Product Roadmap — VOICE OF COPILOT" },
      {
        name: "description",
        content: "Evidence-backed roadmap recommendations with problem, affected customers, business impact, priority and next action.",
      },
      { property: "og:title", content: "Product Roadmap — VOICE OF COPILOT" },
      { property: "og:description", content: "P0/P1/P2 recommendations straight from customer evidence." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoadmapPage,
});

const LANES: { p: Priority; title: string; hint: string }[] = [
  { p: "P0", title: "P0 · Now", hint: "Broken core flows or direct retention risk" },
  { p: "P1", title: "P1 · Next", hint: "Important, schedule this cycle" },
  { p: "P2", title: "P2 · Later", hint: "Improvements and polish" },
];

function RoadmapPage() {
  const { analysis } = useDataset();
  return (
    <>
      <PageHeader
        eyebrow="Product Roadmap"
        title="Recommended next bets"
        description="Affected customers and feedback counts are calculated from linked evidence. Business impact is the AI's qualitative assessment — validate before committing."
      />
      <SampleNotice />
      {!analysis ? (
        <NeedsAnalysis what="roadmap recommendations" />
      ) : (
        <>
          <StaleBanner />
          <div className="grid gap-6 xl:grid-cols-3">
            {LANES.map((lane) => {
              const recs = analysis.recommendations.filter((r) => r.priority === lane.p);
              return (
                <div key={lane.p}>
                  <div className="mb-3 flex items-baseline justify-between">
                    <h2 className="text-base font-semibold text-foreground">{lane.title}</h2>
                    <span className="text-xs text-muted-foreground">{recs.length}</span>
                  </div>
                  <p className="mb-4 text-xs text-muted-foreground">{lane.hint}</p>
                  <div className="space-y-4">
                    {recs.length === 0 && (
                      <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">Nothing here.</p>
                    )}
                    {recs.map((r) => (
                      <Panel key={r.id} className="p-5 md:p-5">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold leading-snug text-foreground">{r.title}</h3>
                          <PriorityPill value={r.priority} />
                        </div>
                        <dl className="mt-3 space-y-3 text-xs">
                          <Field label="Problem">{r.problem}</Field>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-muted px-3 py-2">
                              <p className="text-[11px] text-muted-foreground">Affected customers</p>
                              <p className="font-display text-lg font-semibold text-foreground">{r.affectedCustomers}</p>
                            </div>
                            <div className="rounded-lg bg-muted px-3 py-2">
                              <p className="text-[11px] text-muted-foreground">Feedback items</p>
                              <p className="font-display text-lg font-semibold text-foreground">{r.feedbackCount}</p>
                            </div>
                          </div>
                          <Field label="Business impact (AI assessment)">{r.businessImpact}</Field>
                          <div>
                            <dt className="font-semibold text-foreground">Next action</dt>
                            <dd className="mt-1 flex items-start gap-1.5 rounded-lg bg-primary-soft px-3 py-2 text-accent-foreground">
                              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
                              {r.nextAction}
                            </dd>
                          </div>
                          <div>
                            <dt className="mb-1.5 font-semibold text-foreground">Evidence</dt>
                            <EvidenceList ids={r.evidenceIds} max={10} />
                          </div>
                          {r.assumptions.length > 0 && (
                            <div className="rounded-lg border border-dashed px-3 py-2">
                              <dt className="font-semibold text-foreground">Assumptions</dt>
                              <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                                {r.assumptions.map((a, i) => <li key={i}>{a}</li>)}
                              </ul>
                            </div>
                          )}
                        </dl>
                        <div className="mt-4 border-t pt-3">
                          <Confidence value={r.confidence} />
                        </div>
                      </Panel>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-foreground">{label}</dt>
      <dd className="mt-0.5 leading-relaxed text-muted-foreground">{children}</dd>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Confidence,
  EvidenceList,
  FeedbackRef,
  NeedsAnalysis,
  PageHeader,
  Panel,
  Pill,
  RiskPill,
  SampleNotice,
  StaleBanner,
  StatCard,
} from "@/components/vc";
import { customerKey } from "@/lib/dedupe";
import { useDataset } from "@/lib/store";
import { CHURN_TYPE_LABEL, type ChurnType } from "@/lib/types";
import { Ban, MessageSquareWarning, RotateCcw, Trash } from "lucide-react";

export const Route = createFileRoute("/churn")({
  head: () => ({
    meta: [
      { title: "Churn Detection — VOICE OF COPILOT" },
      {
        name: "description",
        content: "Detect cancellation, uninstall, repeated complaint and refund frustration signals with evidence and risk levels.",
      },
      { property: "og:title", content: "Churn Detection — VOICE OF COPILOT" },
      { property: "og:description", content: "Spot customers at risk before they leave." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChurnPage,
});

function ChurnPage() {
  const { analysis, dedupe } = useDataset();
  const [risk, setRisk] = useState("all");
  const [type, setType] = useState("all");

  const signals = useMemo(
    () =>
      (analysis?.churnSignals ?? []).filter(
        (c) => (risk === "all" || c.risk === risk) && (type === "all" || c.type === type),
      ),
    [analysis, risk, type],
  );

  // Deterministic: identified customers with 2+ unique negative/mixed feedback items.
  const repeat = useMemo(() => {
    if (!analysis) return [];
    const groups = new Map<string, { customer: string; ids: string[] }>();
    for (const f of dedupe.unique) {
      if (!f.customer?.trim()) continue;
      const s = analysis.itemLabels[f.id]?.sentiment;
      if (s !== "negative" && s !== "mixed") continue;
      const k = customerKey(f);
      const g = groups.get(k) ?? { customer: f.customer.trim(), ids: [] };
      g.ids.push(f.id);
      groups.set(k, g);
    }
    return [...groups.values()].filter((g) => g.ids.length >= 2).sort((a, b) => b.ids.length - a.ids.length);
  }, [analysis, dedupe]);

  const count = (t: ChurnType[]) => analysis?.churnSignals.filter((c) => t.includes(c.type)).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Churn Detection"
        title="Customers at risk"
        description="Signals are only shown when the customer's own words support them. Evidence is checked verbatim against the original feedback."
      />
      <SampleNotice />
      {!analysis ? (
        <NeedsAnalysis what="churn signals" />
      ) : (
        <>
          <StaleBanner />
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Cancellation / switching" value={count(["cancellation_intent", "competitor_switch"])} icon={<Ban />} tone="negative" />
            <StatCard label="Uninstall intent" value={count(["uninstall_intent"])} icon={<Trash />} tone="warning" />
            <StatCard label="Repeated unresolved complaints" value={count(["repeated_unresolved_complaint"])} icon={<MessageSquareWarning />} tone="violet" />
            <StatCard label="Refund frustration" value={count(["refund_frustration"])} icon={<RotateCcw />} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
            <Panel
              title={`Churn signals · ${signals.length}`}
              action={
                <div className="flex gap-2">
                  <Select value={risk} onValueChange={setRisk}>
                    <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All risk</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All signal types</SelectItem>
                      {Object.entries(CHURN_TYPE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
            >
              <div className="space-y-3">
                {signals.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No signals match these filters.</p>}
                {signals.map((c) => (
                  <div key={`${c.feedbackId}-${c.type}`} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskPill value={c.risk} />
                      <Pill tone="primary" className="normal-case">{CHURN_TYPE_LABEL[c.type]}</Pill>
                      <FeedbackRef id={c.feedbackId} />
                      <span className="text-xs text-muted-foreground">{c.customer ?? "Unidentified customer"}</span>
                    </div>
                    <blockquote className="mt-3 border-l-2 border-negative pl-3 text-sm italic text-foreground">“{c.evidence}”</blockquote>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">Why: </span>{c.rationale}</p>
                      <Confidence value={c.confidence} />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="Repeat complainers"
              description="Computed, not AI-inferred: identified customers with 2+ unique negative feedback items."
            >
              {repeat.length === 0 ? (
                <p className="text-sm text-muted-foreground">No identified customer has complained more than once.</p>
              ) : (
                <ul className="space-y-3">
                  {repeat.map((r) => (
                    <li key={r.customer} className="rounded-xl bg-muted p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-semibold text-foreground">{r.customer}</span>
                        <Pill tone="negative">{r.ids.length} complaints</Pill>
                      </div>
                      <div className="mt-2"><EvidenceList ids={r.ids} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </>
  );
}

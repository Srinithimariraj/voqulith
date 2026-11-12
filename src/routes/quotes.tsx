import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, FeedbackRef, PageHeader, Panel, Pill, SampleNotice, SentimentPill, StaleBanner, SyntheticPill } from "@/components/vc";
import { useDataset } from "@/lib/store";
import { SOURCES } from "@/lib/types";

export const Route = createFileRoute("/quotes")({
  head: () => ({
    meta: [
      { title: "Customer Quotes — VOICE OF COPILOT" },
      { name: "description", content: "Original customer statements with source and feedback ID, verified word-for-word." },
      { property: "og:title", content: "Customer Quotes — VOICE OF COPILOT" },
      { property: "og:description", content: "The customer's own words, traceable to every source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuotesPage,
});

function QuotesPage() {
  const { analysis, feedback, byId, dedupe } = useDataset();
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("all");
  const [sent, setSent] = useState("all");
  const themeName = useMemo(() => new Map(analysis?.themes.map((t) => [t.id, t.name]) ?? []), [analysis]);
  const needle = q.trim().toLowerCase();

  const quotes = useMemo(
    () =>
      (analysis?.quotes ?? []).filter((x) => {
        const item = byId.get(x.feedbackId);
        if (src !== "all" && item?.source !== src) return false;
        if (sent !== "all" && x.sentiment !== sent) return false;
        return !needle || x.quote.toLowerCase().includes(needle) || x.feedbackId.toLowerCase().includes(needle);
      }),
    [analysis, byId, src, sent, needle],
  );

  const originals = useMemo(
    () =>
      dedupe.unique.filter((f) => {
        if (src !== "all" && f.source !== src) return false;
        const s = analysis?.itemLabels[f.id]?.sentiment;
        if (sent !== "all" && s !== sent) return false;
        return !needle || f.text.toLowerCase().includes(needle) || f.id.toLowerCase().includes(needle) || (f.customer ?? "").toLowerCase().includes(needle);
      }),
    [dedupe, analysis, src, sent, needle],
  );

  if (feedback.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Customer Quotes" title="In the customer's words" />
        <EmptyState title="No feedback yet" description="Add feedback to browse original customer statements.">
          <Button asChild variant="brand"><Link to="/upload">Add feedback</Link></Button>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Customer Quotes"
        title="In the customer's words"
        description="Highlighted quotes are excerpts chosen by the AI and verified to appear exactly in the original feedback. The full list shows every unique original statement."
      />
      <SampleNotice />
      <StaleBanner />
      <div className="mb-4 flex flex-col gap-2 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search quotes, IDs or customers" className="pl-9" />
        </div>
        <Select value={src} onValueChange={setSrc}>
          <SelectTrigger className="md:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sent} onValueChange={setSent}>
          <SelectTrigger className="md:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sentiment</SelectItem>
            <SelectItem value="negative">Negative</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
            <SelectItem value="neutral">Neutral</SelectItem>
            <SelectItem value="positive">Positive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue={analysis ? "quotes" : "all"}>
        <TabsList>
          <TabsTrigger value="quotes" disabled={!analysis}>Key quotes {analysis ? `(${quotes.length})` : ""}</TabsTrigger>
          <TabsTrigger value="all">All original feedback ({originals.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="quotes" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {quotes.length === 0 && <p className="text-sm text-muted-foreground">No quotes match.</p>}
            {quotes.map((x, i) => {
              const item = byId.get(x.feedbackId);
              return (
                <Panel key={`${x.feedbackId}-${i}`} className="p-5 md:p-5">
                  <p className="font-display text-[15px] leading-relaxed text-foreground">“{x.quote}”</p>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    <FeedbackRef id={x.feedbackId} />
                    {item && <Pill tone="primary" className="normal-case">{item.source}</Pill>}
                    <SentimentPill value={x.sentiment} />
                    {x.themeId && themeName.get(x.themeId) && <Pill tone="violet" className="normal-case">{themeName.get(x.themeId)}</Pill>}
                    {item?.origin === "sample" && <SyntheticPill />}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{item?.customer ?? "Unidentified customer"}{item?.date ? ` · ${item.date}` : ""}</span>
                    <span className="flex items-center gap-1 text-positive"><BadgeCheck className="size-3.5" /> Verbatim</span>
                  </div>
                </Panel>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-card">
            {originals.length === 0 && <p className="p-6 text-sm text-muted-foreground">No feedback matches.</p>}
            {originals.map((f) => {
              const lab = analysis?.itemLabels[f.id];
              const copies = dedupe.copies[f.id];
              return (
                <div key={f.id} className="px-5 py-4">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] font-semibold text-foreground">{f.id}</span>
                    <Pill tone="primary" className="normal-case">{f.source}</Pill>
                    {lab && <SentimentPill value={lab.sentiment} />}
                    {lab?.themeId && themeName.get(lab.themeId) && <Pill tone="violet" className="normal-case">{themeName.get(lab.themeId)}</Pill>}
                    {copies ? <Pill tone="warning" className="normal-case">+{copies} duplicate{copies > 1 ? "s" : ""}</Pill> : null}
                    {f.origin === "sample" && <SyntheticPill />}
                  </div>
                  <p className="text-sm leading-relaxed text-foreground">{f.text}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {f.customer ?? "Unidentified customer"}{f.date ? ` · ${f.date}` : ""}{f.rating != null ? ` · ${f.rating}★` : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

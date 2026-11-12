import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CalendarRange, MessageSquareWarning, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { HorizontalBars, TrendChart } from "@/components/charts";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  EvidenceList,
  NeedsAnalysis,
  PageHeader,
  Panel,
  PriorityPill,
  SampleNotice,
  SeverityPill,
  StaleBanner,
  StatCard,
} from "@/components/vc";
import {
  affectedCustomers,
  buildPopulation,
  compareCounts,
  complaintTrend,
  defaultRanges,
  impactRows,
  isComplaint,
  MIN_ITEMS_PER_PERIOD,
  periodStats,
  themeMembers,
  validRange,
  type Change,
  type DateRange,
  type ImpactRow,
  type PeriodStats,
} from "@/lib/impact";
import { useDataset } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/impact")({
  head: () => ({
    meta: [
      { title: "Impact Measurement — VOICE OF COPILOT" },
      {
        name: "description",
        content: "Customers affected per pain point, feedback by theme, severity, business impact, complaint trends and date-range comparisons.",
      },
      { property: "og:title", content: "Impact Measurement — VOICE OF COPILOT" },
      { property: "og:description", content: "Measure how many customers each problem affects and how complaints change over time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImpactPage,
});

const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function ImpactPage() {
  const { analysis, dedupe } = useDataset();
  const pop = useMemo(() => buildPopulation(dedupe.unique), [dedupe.unique]);

  return (
    <>
      <PageHeader
        eyebrow="Impact Measurement"
        title="How big is each problem?"
        description="Every number here is counted from your uploaded feedback: duplicates removed, customers counted by unique customer ID. Business impact is the AI's written assessment from the linked roadmap item."
      />
      <SampleNotice />
      {!analysis ? <NeedsAnalysis what="impact metrics" /> : <ImpactBody pop={pop} />}
    </>
  );
}

function ImpactBody({ pop }: { pop: ReturnType<typeof buildPopulation> }) {
  const { analysis } = useDataset();
  const a = analysis!;
  const labels = a.itemLabels;

  const pains = useMemo(
    () => impactRows(a.painPoints.map((p) => ({ id: p.id, name: p.title, severity: p.severity, feedbackIds: p.feedbackIds })), pop, a.recommendations),
    [a, pop],
  );
  const themes = useMemo(
    () => impactRows(a.themes.map((t) => ({ id: t.id, name: t.name, severity: t.severity, feedbackIds: t.feedbackIds })), pop, a.recommendations).sort((x, y) => y.count - x.count),
    [a, pop],
  );
  const complaintIds = pop.items.filter((i) => isComplaint(i.id, labels)).map((i) => i.id);
  const complaintCustomers = affectedCustomers(complaintIds, pop.byId);
  const allCustomers = affectedCustomers(pop.items.map((i) => i.id), pop.byId);
  const unlabeled = pop.items.filter((i) => !labels[i.id]).length;

  return (
    <>
      <StaleBanner />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unique feedback" value={pop.items.length} hint={`${dedupe(pop)} duplicates already removed`} icon={<MessageSquareWarning />} />
        <StatCard
          label="Complaints"
          value={complaintIds.length}
          hint={pop.items.length ? `${Math.round((complaintIds.length / pop.items.length) * 1000) / 10}% of unique feedback · negative or mixed` : "—"}
          icon={<AlertCircle />}
          tone="negative"
        />
        <StatCard
          label="Customers complaining"
          value={complaintCustomers.customers}
          hint={`of ${allCustomers.customers} unique customer IDs${complaintCustomers.unidentified ? ` · +${complaintCustomers.unidentified} complaints with no ID` : ""}`}
          icon={<Users />}
          tone="violet"
        />
        <StatCard
          label="Dated feedback"
          value={`${pop.dated.length}/${pop.items.length}`}
          hint={pop.minDay && pop.maxDay ? `${fmtDay(pop.minDay)} – ${fmtDay(pop.maxDay)} ${pop.maxDay.slice(0, 4)}` : "No usable dates"}
          icon={<CalendarRange />}
          tone="warning"
        />
      </div>
      {unlabeled > 0 && (
        <p className="mb-6 rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
          {unlabeled} unique feedback items have no AI sentiment label yet, so they are not counted as complaints. Re-run the analysis to include them.
        </p>
      )}

      <Panel
        title="Pain point impact"
        description="Customers affected = distinct customer IDs in the pain point's evidence. Feedback with no customer ID is shown separately and never treated as a customer."
        className="mb-6"
      >
        <ImpactTable rows={pains} firstCol="Pain point" />
      </Panel>

      <div className="mb-6 grid gap-6 xl:grid-cols-5">
        <Panel title="Feedback count by theme" className="xl:col-span-2">
          <HorizontalBars data={themes.map((t) => ({ name: t.name, value: t.count }))} />
        </Panel>
        <Panel title="Theme share, severity and business impact" description="Percentage of all unique feedback." className="xl:col-span-3">
          <ImpactTable rows={themes} firstCol="Theme" compact />
        </Panel>
      </div>

      <TrendPanel pop={pop} />
      <ComparePanel pop={pop} />
    </>
  );

  function dedupe(p: typeof pop) {
    return Math.max(0, a.totals.feedbackItems - a.totals.uniqueFeedback, 0) || 0 + 0 * p.items.length;
  }
}

function ImpactTable({ rows, firstCol, compact }: { rows: ImpactRow[]; firstCol: string; compact?: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No items with evidence in the current feedback.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{firstCol}</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead className="text-right">Feedback</TableHead>
            <TableHead className="text-right">% of total</TableHead>
            <TableHead className="text-right">Customers</TableHead>
            <TableHead className="min-w-56">Business impact (AI assessment)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="align-top">
              <TableCell className="min-w-44">
                <p className="font-medium text-foreground">{r.name}</p>
                {!compact && (
                  <div className="mt-1.5">
                    <EvidenceList ids={r.feedbackIds} max={6} />
                  </div>
                )}
              </TableCell>
              <TableCell>
                <SeverityPill value={r.severity} />
              </TableCell>
              <TableCell className="text-right font-medium">{r.count}</TableCell>
              <TableCell className="text-right">{r.percentage}%</TableCell>
              <TableCell className="text-right">
                <span className="font-medium">{r.customers}</span>
                {r.unidentified > 0 && <p className="text-[11px] text-muted-foreground">+{r.unidentified} no ID</p>}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.impact ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <PriorityPill value={r.impact.priority} />
                      <span className="line-clamp-1 font-medium text-foreground">{r.impact.title}</span>
                    </div>
                    <p className={cn("leading-relaxed", compact && "line-clamp-3")}>{r.impact.text}</p>
                  </div>
                ) : (
                  "No linked roadmap item"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Insufficient({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-dashed bg-muted/50 px-4 py-6 text-sm text-muted-foreground">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold text-foreground">Insufficient data</p>
        <p className="mt-0.5">{children}</p>
      </div>
    </div>
  );
}

function TrendPanel({ pop }: { pop: ReturnType<typeof buildPopulation> }) {
  const { analysis } = useDataset();
  const a = analysis!;
  const [themeId, setThemeId] = useState("all");
  const members = useMemo(() => themeMembers(a), [a]);
  const trend = useMemo(() => {
    const set = themeId === "all" ? null : members.get(themeId);
    return complaintTrend(pop, a.itemLabels, set ? (id) => set.has(id) : undefined);
  }, [pop, a, themeId, members]);

  return (
    <Panel
      title="Complaint trend over time"
      description={`Counts per ${trend.ok ? trend.granularity : "period"} from feedback dates. ${pop.undated} undated items are left out.`}
      className="mb-6"
      action={
        <Select value={themeId} onValueChange={setThemeId}>
          <SelectTrigger className="w-52" aria-label="Filter trend by theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All feedback</SelectItem>
            {a.themes.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!trend.ok ? (
        <Insufficient>{trend.reason} Add feedback with dates from more than one period to see a trend.</Insufficient>
      ) : (
        <>
          <TrendChart
            data={trend.buckets.map((b) => ({
              label: trend.granularity === "month" ? b.start.slice(0, 7) : trend.granularity === "week" ? `Wk of ${fmtDay(b.start)}` : fmtDay(b.start),
              feedback: b.feedback,
              complaints: b.complaints,
            }))}
          />
          {trend.buckets.some((b) => b.partial) && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              The first and/or last {trend.granularity} only partly overlap your feedback dates, so their counts cover fewer days.
            </p>
          )}
        </>
      )}
    </Panel>
  );
}

function ChangeBadge({ change }: { change: Change }) {
  if (change.kind === "insufficient") return <span className="text-xs text-muted-foreground">Insufficient data</span>;
  if (change.kind === "no-change-zero") return <span className="text-xs text-muted-foreground">None in either</span>;
  if (change.kind === "new") return <span className="text-xs font-semibold text-negative">New in B</span>;
  const v = change.value;
  return (
    <span className={cn("text-xs font-semibold", v > 0 ? "text-negative" : v < 0 ? "text-positive" : "text-muted-foreground")}>
      {v > 0 ? "+" : ""}
      {v}%
    </span>
  );
}

function RangeInputs({ label, value, onChange }: { label: string; value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <fieldset className="rounded-xl border p-3">
      <legend className="px-1 text-xs font-semibold text-foreground">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[11px] text-muted-foreground" htmlFor={`${label}-from`}>From</Label>
          <Input id={`${label}-from`} type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground" htmlFor={`${label}-to`}>To</Label>
          <Input id={`${label}-to`} type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
        </div>
      </div>
    </fieldset>
  );
}

function PeriodSummary({ s, name }: { s: PeriodStats; name: string }) {
  return (
    <div className="rounded-xl bg-muted px-4 py-3 text-xs">
      <p className="font-semibold text-foreground">
        {name} · {s.days} day{s.days === 1 ? "" : "s"}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <div>
          <p className="text-muted-foreground">Feedback</p>
          <p className="font-display text-lg font-semibold text-foreground">{s.feedback}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Complaints</p>
          <p className="font-display text-lg font-semibold text-foreground">{s.complaints}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Complaint rate</p>
          <p className="font-display text-lg font-semibold text-foreground">
            {s.complaintRate == null ? "—" : `${Math.round(s.complaintRate * 100)}%`}
          </p>
        </div>
      </div>
      <p className="mt-1 text-muted-foreground">{s.complainingCustomers} customers with complaints</p>
      {!s.sufficient && <p className="mt-1 font-medium text-warning">Fewer than {MIN_ITEMS_PER_PERIOD} dated items — not enough to compare.</p>}
    </div>
  );
}

function ComparePanel({ pop }: { pop: ReturnType<typeof buildPopulation> }) {
  const { analysis } = useDataset();
  const a = analysis!;
  const defaults = useMemo(() => defaultRanges(pop), [pop]);
  const [ra, setRa] = useState<DateRange | null>(defaults?.a ?? null);
  const [rb, setRb] = useState<DateRange | null>(defaults?.b ?? null);
  const members = useMemo(() => themeMembers(a), [a]);

  const rangeA = ra ?? defaults?.a ?? null;
  const rangeB = rb ?? defaults?.b ?? null;

  if (!rangeA || !rangeB) {
    return (
      <Panel title="Compare two date ranges">
        <Insufficient>
          {pop.dated.length === 0 ? "None of the feedback has a usable date." : "All dated feedback is from a single day."} Historical periods are unavailable, so no comparison can be made.
        </Insufficient>
      </Panel>
    );
  }

  const valid = validRange(rangeA) && validRange(rangeB);
  const overlap = valid && rangeA.from <= rangeB.to && rangeB.from <= rangeA.to;
  const sa = periodStats(pop, a.itemLabels, members, rangeA);
  const sb = periodStats(pop, a.itemLabels, members, rangeB);
  const rateDiff = sa.complaintRate != null && sb.complaintRate != null ? Math.round((sb.complaintRate - sa.complaintRate) * 100) : null;

  return (
    <Panel
      title="Compare two date ranges"
      description={`Complaint counts in period A vs period B. A % change is only shown when both periods have at least ${MIN_ITEMS_PER_PERIOD} dated feedback items and period A is not zero.`}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <RangeInputs label="Period A" value={rangeA} onChange={setRa} />
        <RangeInputs label="Period B" value={rangeB} onChange={setRb} />
      </div>
      {!valid ? (
        <p className="mt-4 text-sm text-negative">Each period needs a start date on or before its end date.</p>
      ) : (
        <>
          {overlap && <p className="mt-3 text-xs font-medium text-warning">These periods overlap, so some feedback is counted in both.</p>}
          {sa.days !== sb.days && (
            <p className="mt-3 text-xs text-muted-foreground">The periods have different lengths ({sa.days} vs {sb.days} days); the complaint rate is fairer to compare than raw counts.</p>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <PeriodSummary s={sa} name="Period A" />
            <PeriodSummary s={sb} name="Period B" />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              Complaints A → B: <ChangeBadge change={compareCounts(sa, sb, sa.complaints, sb.complaints)} />
            </span>
            <span className="text-muted-foreground">
              Complaint rate:{" "}
              {rateDiff == null ? (
                <span className="text-xs">Insufficient data</span>
              ) : (
                <span className={cn("text-xs font-semibold", rateDiff > 0 ? "text-negative" : rateDiff < 0 ? "text-positive" : "")}>
                  {rateDiff > 0 ? "+" : ""}
                  {rateDiff} pts
                </span>
              )}
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Theme (complaints)</TableHead>
                  <TableHead className="text-right">Period A</TableHead>
                  <TableHead className="text-right">Period B</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.themes.map((t) => {
                  const ca = sa.byTheme[t.id] ?? 0;
                  const cb = sb.byTheme[t.id] ?? 0;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-foreground">{t.name}</TableCell>
                      <TableCell className="text-right">{ca}</TableCell>
                      <TableCell className="text-right">{cb}</TableCell>
                      <TableCell className="text-right">
                        <ChangeBadge change={compareCounts(sa, sb, ca, cb)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Panel>
  );
}

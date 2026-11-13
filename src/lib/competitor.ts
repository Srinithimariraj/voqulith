/**
 * Competitor Comparison maths. Pure functions over the uploaded records and the
 * grounded comparison output — nothing is estimated or invented.
 */
import { dedupeFeedback } from "./dedupe";
import { affectedCustomers, buildPopulation, dayNumber, type DateRange } from "./impact";
import type { ComparisonOutput, ProductKey } from "./competitor-contract";
import type { FeedbackItem, Sentiment, Severity } from "./types";

/** Below this many analyzed items on either side, shares are shown but differences are not. */
export const MIN_COMPARE_ITEMS = 10;
/** A product with fewer unique items than this is flagged as a small sample. */
export const SMALL_SAMPLE = 30;

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

/* ---------------- dataset profile ---------------- */

export interface DatasetProfile {
  records: number;
  unique: number;
  duplicates: number;
  customersIdentified: number;
  unidentified: number;
  dated: number;
  undated: number;
  minDay: string | null;
  maxDay: string | null;
  spanDays: number | null;
  sources: { source: string; count: number; share: number }[];
}

export function profileDataset(feedback: FeedbackItem[]): DatasetProfile {
  const { unique } = dedupeFeedback(feedback);
  const pop = buildPopulation(unique);
  const { customers, unidentified } = affectedCustomers(
    unique.map((u) => u.id),
    pop.byId,
  );
  const bySource = new Map<string, number>();
  for (const u of unique) bySource.set(u.source, (bySource.get(u.source) ?? 0) + 1);
  return {
    records: feedback.length,
    unique: unique.length,
    duplicates: feedback.length - unique.length,
    customersIdentified: customers,
    unidentified,
    dated: pop.dated.length,
    undated: pop.undated,
    minDay: pop.minDay,
    maxDay: pop.maxDay,
    spanDays: pop.minDay && pop.maxDay ? dayNumber(pop.maxDay) - dayNumber(pop.minDay) + 1 : null,
    sources: [...bySource.entries()]
      .map(([source, count]) => ({ source, count, share: pct(count, unique.length) }))
      .sort((a, b) => b.count - a.count),
  };
}

/** The date window both products cover, or null when either has no dates or they don't overlap. */
export function sharedWindow(a: DatasetProfile, b: DatasetProfile): DateRange | null {
  if (!a.minDay || !a.maxDay || !b.minDay || !b.maxDay) return null;
  const from = a.minDay > b.minDay ? a.minDay : b.minDay;
  const to = a.maxDay < b.maxDay ? a.maxDay : b.maxDay;
  return from <= to ? { from, to } : null;
}

/** Keep only feedback whose (unambiguous) date falls inside the window. Undated feedback is excluded. */
export function filterToWindow(feedback: FeedbackItem[], window: DateRange): FeedbackItem[] {
  const pop = buildPopulation(feedback);
  const keep = new Set(pop.dated.filter((d) => d.day >= window.from && d.day <= window.to).map((d) => d.item.id));
  return feedback.filter((f) => keep.has(f.id));
}

/* ---------------- comparability disclosures ---------------- */

export interface ComparabilityNote {
  level: "warning" | "info";
  text: string;
}

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const period = (p: DatasetProfile) => (p.minDay && p.maxDay ? `${fmt(p.minDay)} – ${fmt(p.maxDay)}` : "unknown");

export function comparabilityNotes(
  a: DatasetProfile,
  b: DatasetProfile,
  names: Record<ProductKey, string>,
): ComparabilityNote[] {
  const notes: ComparabilityNote[] = [];
  const big = a.unique >= b.unique ? { p: a, n: names.A } : { p: b, n: names.B };
  const small = a.unique >= b.unique ? { p: b, n: names.B } : { p: a, n: names.A };
  if (small.p.unique > 0 && big.p.unique / small.p.unique >= 2) {
    notes.push({
      level: "warning",
      text: `${big.n} has ${(big.p.unique / small.p.unique).toFixed(1)}× as many unique items as ${small.n} (${big.p.unique} vs ${small.p.unique}). Compare shares (%), not raw counts.`,
    });
  } else {
    notes.push({ level: "info", text: `Sample sizes: ${names.A} ${a.unique} unique items, ${names.B} ${b.unique}.` });
  }
  for (const [p, n] of [
    [a, names.A],
    [b, names.B],
  ] as const) {
    if (p.unique > 0 && p.unique < SMALL_SAMPLE)
      notes.push({ level: "warning", text: `${n} has only ${p.unique} unique items, so its percentages can swing a lot from a few comments.` });
    if (p.unique > 0 && p.dated === 0)
      notes.push({ level: "warning", text: `${n} has no usable dates, so its collection period is unknown.` });
    else if (p.undated > 0)
      notes.push({ level: "info", text: `${p.undated} of ${p.unique} ${n} items have no usable date.` });
  }
  if (a.dated > 0 && b.dated > 0) {
    const w = sharedWindow(a, b);
    if (!w) {
      notes.push({
        level: "warning",
        text: `Collection periods don't overlap (${names.A}: ${period(a)}; ${names.B}: ${period(b)}). Differences may reflect timing, not the product.`,
      });
    } else {
      const overlap = dayNumber(w.to) - dayNumber(w.from) + 1;
      const longest = Math.max(a.spanDays ?? 0, b.spanDays ?? 0);
      notes.push({
        level: overlap / longest < 0.5 ? "warning" : "info",
        text: `Collection periods — ${names.A}: ${period(a)}; ${names.B}: ${period(b)}. They share ${overlap} day${overlap === 1 ? "" : "s"}.`,
      });
    }
  }
  const topA = a.sources[0];
  const topB = b.sources[0];
  const allSources = new Set([...a.sources, ...b.sources].map((s) => s.source));
  const share = (p: DatasetProfile, s: string) => p.sources.find((x) => x.source === s)?.share ?? 0;
  const gap = Math.max(0, ...[...allSources].map((s) => Math.abs(share(a, s) - share(b, s))));
  if (topA && topB && gap >= 30) {
    notes.push({
      level: "warning",
      text: `Different channel mix: ${names.A} is mostly ${topA.source} (${topA.share}%), ${names.B} is mostly ${topB.source} (${topB.share}%). Channels attract different kinds of comments.`,
    });
  }
  return notes;
}

/* ---------------- metrics from a grounded comparison ---------------- */

export interface SideMetrics {
  analyzed: number;
  labelled: number;
  sentiment: Record<Sentiment, number>;
  sentimentPct: Record<Sentiment, number>;
  complaints: number;
  /** Complaints (negative or mixed) as % of labelled items; null when nothing was labelled. */
  complaintRate: number | null;
}

const SENTS: Sentiment[] = ["negative", "mixed", "neutral", "positive"];

export function sideMetrics(out: ComparisonOutput, key: ProductKey): SideMetrics {
  const ids = out.products[key].analyzed_ids;
  const sentiment: Record<Sentiment, number> = { negative: 0, mixed: 0, neutral: 0, positive: 0 };
  let labelled = 0;
  for (const id of ids) {
    const l = out.labels[id];
    if (!l || l.product !== key) continue;
    labelled++;
    sentiment[l.sentiment]++;
  }
  const complaints = sentiment.negative + sentiment.mixed;
  return {
    analyzed: ids.length,
    labelled,
    sentiment,
    sentimentPct: Object.fromEntries(SENTS.map((s) => [s, pct(sentiment[s], labelled)])) as Record<Sentiment, number>,
    complaints,
    complaintRate: labelled > 0 ? pct(complaints, labelled) : null,
  };
}

export interface SideCell {
  count: number;
  /** Share of that product's analyzed items. */
  pct: number;
  complaints: number;
  customers: number;
  unidentified: number;
  ids: string[];
}

export interface ThemeComparisonRow {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  A: SideCell;
  B: SideCell;
  common: boolean;
  /** B share minus A share in percentage points; null when either side is below MIN_COMPARE_ITEMS. */
  diffPp: number | null;
}

function cell(ids: string[], key: ProductKey, out: ComparisonOutput, byId: Map<string, FeedbackItem>): SideCell {
  const mine = [...new Set(ids)].filter((id) => out.labels[id]?.product === key || out.products[key].analyzed_ids.includes(id));
  const scoped = mine.filter((id) => (out.labels[id]?.product ?? null) === key || !out.labels[id]);
  const complaints = scoped.filter((id) => {
    const s = out.labels[id]?.sentiment;
    return s === "negative" || s === "mixed";
  }).length;
  const c = affectedCustomers(scoped, byId);
  return {
    count: scoped.length,
    pct: pct(scoped.length, out.products[key].analyzed_ids.length),
    complaints,
    customers: c.customers,
    unidentified: c.unidentified,
    ids: scoped,
  };
}

function diff(out: ComparisonOutput, a: SideCell, b: SideCell): number | null {
  if (out.products.A.analyzed_ids.length < MIN_COMPARE_ITEMS || out.products.B.analyzed_ids.length < MIN_COMPARE_ITEMS) return null;
  return Math.round((b.pct - a.pct) * 10) / 10;
}

export function themeComparison(out: ComparisonOutput, byId: Map<string, FeedbackItem>): ThemeComparisonRow[] {
  const members = new Map<string, Record<ProductKey, string[]>>();
  for (const [id, l] of Object.entries(out.labels)) {
    if (!l.theme_id) continue;
    const m = members.get(l.theme_id) ?? { A: [], B: [] };
    m[l.product].push(id);
    members.set(l.theme_id, m);
  }
  return out.themes
    .map((t) => {
      const m = members.get(t.id) ?? { A: [], B: [] };
      const A = cell(m.A, "A", out, byId);
      const B = cell(m.B, "B", out, byId);
      return { id: t.id, name: t.name, description: t.description, severity: t.severity, A, B, common: A.count > 0 && B.count > 0, diffPp: diff(out, A, B) };
    })
    .sort((x, y) => Number(y.common) - Number(x.common) || y.A.pct + y.B.pct - (x.A.pct + x.B.pct));
}

export interface FeatureRequestRow {
  id: string;
  title: string;
  description: string;
  A: SideCell;
  B: SideCell;
  common: boolean;
  diffPp: number | null;
}

export function featureRequestComparison(out: ComparisonOutput, byId: Map<string, FeedbackItem>): FeatureRequestRow[] {
  return out.feature_requests
    .map((f) => {
      const A = cell(f.feedback_ids.filter((id) => out.products.A.analyzed_ids.includes(id)), "A", out, byId);
      const B = cell(f.feedback_ids.filter((id) => out.products.B.analyzed_ids.includes(id)), "B", out, byId);
      return { id: f.id, title: f.title, description: f.description, A, B, common: A.count > 0 && B.count > 0, diffPp: diff(out, A, B) };
    })
    .filter((r) => r.A.count + r.B.count > 0)
    .sort((x, y) => y.A.count + y.B.count - (x.A.count + x.B.count));
}

/** Split an opportunity's evidence by product so the UI can show both sides of the contrast. */
export function evidenceBySide(ids: string[], out: ComparisonOutput): Record<ProductKey, string[]> {
  return {
    A: ids.filter((id) => out.products.A.analyzed_ids.includes(id)),
    B: ids.filter((id) => out.products.B.analyzed_ids.includes(id)),
  };
}

import type { AnalysisResult, FeedbackItem, Priority, Recommendation, Severity } from "./types";

/**
 * Impact Measurement maths. Everything here is computed from the uploaded feedback
 * records and the grounded analysis — nothing is estimated or invented.
 */

/** A period needs at least this many dated, unique feedback items before we compare it. */
export const MIN_ITEMS_PER_PERIOD = 5;

const DAY_MS = 86_400_000;

/* ---------------- dates ---------------- */

export type NumericDateOrder = "dmy" | "mdy" | null;

function toIso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null; // e.g. 31 Feb
  return dt.toISOString().slice(0, 10);
}

const ISO_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const NUM_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/;

/**
 * Decide whether slash dates in this dataset are day-first or month-first.
 * Only decided when the data itself proves it (a part > 12); otherwise null.
 */
export function detectNumericOrder(raw: (string | undefined)[]): NumericDateOrder {
  let dmy = false;
  let mdy = false;
  for (const r of raw) {
    const m = r?.trim().match(NUM_RE);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return null;
}

/** Returns YYYY-MM-DD, or null when the date is missing, invalid or ambiguous. */
export function parseFeedbackDate(raw: string | undefined, order: NumericDateOrder): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const iso = s.match(ISO_RE);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const num = s.match(NUM_RE);
  if (num) {
    const a = Number(num[1]);
    const b = Number(num[2]);
    const y = Number(num[3]);
    if (a > 12) return toIso(y, b, a);
    if (b > 12) return toIso(y, a, b);
    if (a === b) return toIso(y, a, b);
    if (order === "dmy") return toIso(y, b, a);
    if (order === "mdy") return toIso(y, a, b);
    return null; // genuinely ambiguous, e.g. 03/04/2026 with no other evidence
  }
  // Excel serial day numbers
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * DAY_MS).toISOString().slice(0, 10);
    return null;
  }
  if (/[a-z]/i.test(s)) {
    const t = Date.parse(s);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  return null;
}

export const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const dayToIso = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/* ---------------- population ---------------- */

export interface DatedItem {
  item: FeedbackItem;
  day: string;
}

export interface Population {
  /** Unique (de-duplicated) feedback in the current dataset. */
  items: FeedbackItem[];
  byId: Map<string, FeedbackItem>;
  dated: DatedItem[];
  undated: number;
  minDay: string | null;
  maxDay: string | null;
}

export function buildPopulation(unique: FeedbackItem[]): Population {
  const order = detectNumericOrder(unique.map((u) => u.date));
  const dated: DatedItem[] = [];
  for (const item of unique) {
    const day = parseFeedbackDate(item.date, order);
    if (day) dated.push({ item, day });
  }
  dated.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  return {
    items: unique,
    byId: new Map(unique.map((u) => [u.id, u])),
    dated,
    undated: unique.length - dated.length,
    minDay: dated[0]?.day ?? null,
    maxDay: dated.at(-1)?.day ?? null,
  };
}

/* ---------------- customers ---------------- */

const customerId = (item: FeedbackItem) => item.customer?.trim().toLowerCase() || null;

/** Distinct customer IDs behind feedback IDs. Feedback without a customer ID is reported separately, never guessed. */
export function affectedCustomers(ids: string[], byId: Map<string, FeedbackItem>) {
  const customers = new Set<string>();
  let unidentified = 0;
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) continue;
    const c = customerId(item);
    if (c) customers.add(c);
    else unidentified++;
  }
  return { customers: customers.size, unidentified };
}

/* ---------------- impact rows ---------------- */

export interface LinkedImpact {
  recommendationId: string;
  title: string;
  text: string;
  priority: Priority;
}

/** The roadmap recommendation that shares the most evidence with these feedback IDs. */
export function linkedRecommendation(ids: string[], recs: Recommendation[]): LinkedImpact | null {
  const set = new Set(ids);
  let best: Recommendation | null = null;
  let bestOverlap = 0;
  for (const r of recs) {
    const overlap = r.evidenceIds.filter((id) => set.has(id)).length;
    if (overlap > bestOverlap) {
      best = r;
      bestOverlap = overlap;
    }
  }
  return best
    ? { recommendationId: best.id, title: best.title, text: best.businessImpact, priority: best.priority }
    : null;
}

export interface ImpactRow {
  id: string;
  name: string;
  severity: Severity;
  feedbackIds: string[];
  count: number;
  percentage: number;
  customers: number;
  unidentified: number;
  impact: LinkedImpact | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function impactRows(
  entries: { id: string; name: string; severity: Severity; feedbackIds: string[] }[],
  pop: Population,
  recs: Recommendation[],
): ImpactRow[] {
  const total = pop.items.length;
  return entries
    .map((e) => {
      const ids = [...new Set(e.feedbackIds)].filter((id) => pop.byId.has(id));
      const { customers, unidentified } = affectedCustomers(ids, pop.byId);
      return {
        id: e.id,
        name: e.name,
        severity: e.severity,
        feedbackIds: ids,
        count: ids.length,
        percentage: total ? round1((ids.length / total) * 100) : 0,
        customers,
        unidentified,
        impact: linkedRecommendation(ids, recs),
      };
    })
    .filter((r) => r.count > 0);
}

/* ---------------- complaints ---------------- */

export function isComplaint(id: string, labels: AnalysisResult["itemLabels"]): boolean {
  const s = labels[id]?.sentiment;
  return s === "negative" || s === "mixed";
}

/** Feedback IDs belonging to a theme: the theme's evidence plus items the AI labelled with it. */
export function themeMembers(analysis: AnalysisResult): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const t of analysis.themes) map.set(t.id, new Set(t.feedbackIds));
  for (const [id, l] of Object.entries(analysis.itemLabels)) {
    if (l.themeId && map.has(l.themeId)) map.get(l.themeId)!.add(id);
  }
  return map;
}

/* ---------------- trend ---------------- */

export type Granularity = "day" | "week" | "month";

export function pickGranularity(spanDays: number): Granularity {
  if (spanDays <= 13) return "day";
  if (spanDays <= 120) return "week";
  return "month";
}

function bucketStart(day: number, g: Granularity): number {
  if (g === "day") return day;
  if (g === "week") {
    const dow = (new Date(day * DAY_MS).getUTCDay() + 6) % 7; // Monday = 0
    return day - dow;
  }
  const d = new Date(day * DAY_MS);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / DAY_MS);
}

function nextBucket(start: number, g: Granularity): number {
  if (g === "day") return start + 1;
  if (g === "week") return start + 7;
  const d = new Date(start * DAY_MS);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS);
}

export interface TrendBucket {
  start: string;
  end: string;
  /** Bucket extends beyond the first/last dated feedback, so it only covers part of the period. */
  partial: boolean;
  feedback: number;
  complaints: number;
}

export type Trend =
  | { ok: true; granularity: Granularity; buckets: TrendBucket[] }
  | { ok: false; reason: string };

/**
 * Complaint counts per period. `include` limits which feedback counts (e.g. one theme).
 * Requires dated feedback spanning at least two periods.
 */
export function complaintTrend(
  pop: Population,
  labels: AnalysisResult["itemLabels"],
  include?: (id: string) => boolean,
): Trend {
  const rows = include ? pop.dated.filter((d) => include(d.item.id)) : pop.dated;
  if (pop.dated.length === 0) return { ok: false, reason: "None of the feedback has a usable date." };
  if (rows.length === 0) return { ok: false, reason: "No dated feedback matches this selection." };
  const min = dayNumber(pop.minDay!);
  const max = dayNumber(pop.maxDay!);
  const g = pickGranularity(max - min);
  const buckets: TrendBucket[] = [];
  for (let s = bucketStart(min, g); s <= max; s = nextBucket(s, g)) {
    const e = nextBucket(s, g) - 1;
    buckets.push({ start: dayToIso(s), end: dayToIso(e), partial: s < min || e > max, feedback: 0, complaints: 0 });
  }
  if (buckets.length < 2) {
    return { ok: false, reason: "All dated feedback falls in a single period, so there is no history to compare against." };
  }
  for (const { item, day } of rows) {
    const s = dayToIso(bucketStart(dayNumber(day), g));
    const b = buckets.find((x) => x.start === s);
    if (!b) continue;
    b.feedback++;
    if (isComplaint(item.id, labels)) b.complaints++;
  }
  return { ok: true, granularity: g, buckets };
}

/* ---------------- period comparison ---------------- */

export interface DateRange {
  from: string;
  to: string;
}

export interface PeriodStats {
  range: DateRange;
  days: number;
  feedback: number;
  complaints: number;
  /** Complaints / feedback; null when the period has too little data. */
  complaintRate: number | null;
  complainingCustomers: number;
  byTheme: Record<string, number>;
  sufficient: boolean;
}

export function validRange(r: DateRange): boolean {
  return ISO_RE.test(r.from) && ISO_RE.test(r.to) && r.from <= r.to;
}

export function periodStats(
  pop: Population,
  labels: AnalysisResult["itemLabels"],
  members: Map<string, Set<string>>,
  range: DateRange,
): PeriodStats {
  const inRange = pop.dated.filter((d) => d.day >= range.from && d.day <= range.to);
  const complaints = inRange.filter((d) => isComplaint(d.item.id, labels));
  const byTheme: Record<string, number> = {};
  for (const [themeId, ids] of members) {
    byTheme[themeId] = complaints.filter((d) => ids.has(d.item.id)).length;
  }
  const sufficient = inRange.length >= MIN_ITEMS_PER_PERIOD;
  return {
    range,
    days: validRange(range) ? dayNumber(range.to) - dayNumber(range.from) + 1 : 0,
    feedback: inRange.length,
    complaints: complaints.length,
    complaintRate: sufficient ? complaints.length / inRange.length : null,
    complainingCustomers: affectedCustomers(complaints.map((d) => d.item.id), pop.byId).customers,
    byTheme,
    sufficient,
  };
}

export type Change =
  | { kind: "insufficient" }
  | { kind: "no-change-zero" }
  | { kind: "new" }
  | { kind: "pct"; value: number };

/** % change from period A to B. Only reported when both periods have enough data and A is non-zero. */
export function compareCounts(a: PeriodStats, b: PeriodStats, countA: number, countB: number): Change {
  if (!a.sufficient || !b.sufficient) return { kind: "insufficient" };
  if (countA === 0 && countB === 0) return { kind: "no-change-zero" };
  if (countA === 0) return { kind: "new" };
  return { kind: "pct", value: Math.round(((countB - countA) / countA) * 100) };
}

/** Default comparison: the dated span split into an earlier and a later half. */
export function defaultRanges(pop: Population): { a: DateRange; b: DateRange } | null {
  if (!pop.minDay || !pop.maxDay) return null;
  const min = dayNumber(pop.minDay);
  const max = dayNumber(pop.maxDay);
  const n = max - min + 1;
  if (n < 2) return null;
  const half = Math.floor(n / 2);
  return {
    a: { from: dayToIso(min), to: dayToIso(min + half - 1) },
    b: { from: dayToIso(min + half), to: dayToIso(max) },
  };
}

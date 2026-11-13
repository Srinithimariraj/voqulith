/**
 * Contract + grounding for the `compare-products` backend function.
 * Client-safe: shared by the server function, its tests and the comparison page.
 * The AI only labels and groups feedback; every ID is checked here and all numbers
 * are computed by the app from the records themselves.
 */
import { z } from "zod";
import { feedbackRecordSchema, MAX_RECORDS, prepareRecords, type AnalyzeFeedbackErrorCode } from "./analysis-contract";
import type { AnalysisInputItem, Sentiment, Severity } from "./types";

export type ProductKey = "A" | "B";
export const PRODUCT_KEYS: ProductKey[] = ["A", "B"];

/** At most this many unique records per product are sent to the AI in one comparison. */
export const MAX_UNIQUE_PER_PRODUCT = 300;

export const compareProductsInputSchema = z.object({
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1, "product name is required").max(80),
        records: z.array(feedbackRecordSchema).max(MAX_RECORDS, `At most ${MAX_RECORDS} records per product`),
      }),
    )
    .length(2, "Exactly two products are required"),
});
export type CompareProductsInput = z.infer<typeof compareProductsInputSchema>;

export interface ComparisonItem extends AnalysisInputItem {
  product: ProductKey;
}

export type PrepareComparisonResult =
  | {
      ok: true;
      items: ComparisonItem[];
      sides: Record<ProductKey, { name: string; analyzedIds: string[]; recordsReceived: number; duplicatesExcluded: number; limitations: string[] }>;
    }
  | { ok: false; code: "invalid_input" | "empty_input"; message: string };

export function prepareComparison(input: CompareProductsInput): PrepareComparisonResult {
  const items: ComparisonItem[] = [];
  const seen = new Map<string, ProductKey>();
  const sides = {} as Extract<PrepareComparisonResult, { ok: true }>["sides"];
  for (const [i, key] of PRODUCT_KEYS.entries()) {
    const p = input.products[i]!;
    const prepared = prepareRecords(p.records);
    if (!prepared.ok) {
      return { ok: false, code: prepared.code, message: `${p.name}: ${prepared.message}` };
    }
    for (const id of prepared.recordsById.keys()) {
      if (seen.has(id)) return { ok: false, code: "invalid_input", message: `feedback_id "${id}" appears in both products.` };
      seen.set(id, key);
    }
    const limitations = prepared.limitations.filter((l) => !l.startsWith("Only the first"));
    let unique = prepared.items;
    if (unique.length > MAX_UNIQUE_PER_PRODUCT) {
      limitations.push(
        `${p.name}: only the first ${MAX_UNIQUE_PER_PRODUCT} of ${unique.length} unique records were compared; the rest are not reflected.`,
      );
      unique = unique.slice(0, MAX_UNIQUE_PER_PRODUCT);
    }
    const duplicatesExcluded = prepared.duplicateGroups.reduce((s, g) => s + g.duplicate_feedback_ids.length, 0);
    items.push(...unique.map((u) => ({ ...u, product: key })));
    sides[key] = {
      name: p.name,
      analyzedIds: unique.map((u) => u.id),
      recordsReceived: prepared.totalRecords,
      duplicatesExcluded,
      limitations: limitations.map((l) => (l.startsWith(p.name) ? l : `${p.name}: ${l}`)),
    };
  }
  return { ok: true, items, sides };
}

/* ---------------- raw AI output (lenient) ---------------- */

const sentiment = z.enum(["positive", "neutral", "negative", "mixed"]).catch("neutral");
const severity = z.enum(["critical", "high", "medium", "low"]).catch("medium");
const ids = z.array(z.coerce.string()).catch([]);
type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const first = (o: Obj, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
function lenientArray<T extends z.ZodTypeAny>(item: T, aliases: (o: Obj) => Obj = (o) => o) {
  return z
    .array(z.unknown())
    .catch([])
    .transform((arr) =>
      arr.flatMap((raw) => {
        const r = item.safeParse(aliases(asObj(raw)));
        return r.success ? [r.data as z.infer<T>] : [];
      }),
    );
}

export const rawComparisonSchema = z.object({
  summary: z.string().catch(""),
  item_labels: lenientArray(
    z.object({ id: z.string(), sentiment, theme_id: z.string().nullable().catch(null) }),
    (o) => ({ ...o, id: first(o, ["id", "feedback_id"]) }),
  ),
  themes: lenientArray(
    z.object({ id: z.string(), name: z.string(), description: z.string().catch(""), severity }),
    (o) => ({ ...o, id: first(o, ["id", "theme_id"]), name: first(o, ["name", "title"]) }),
  ),
  feature_requests: lenientArray(
    z.object({ id: z.string(), title: z.string(), description: z.string().catch(""), feedback_ids: ids }),
    (o) => ({
      ...o,
      id: first(o, ["id", "request_id"]),
      title: first(o, ["title", "name", "request"]),
      feedback_ids: first(o, ["feedback_ids", "evidence_ids"]),
    }),
  ),
  opportunities: lenientArray(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().catch(""),
      for_product: z.enum(["A", "B", "both"]).catch("both"),
      next_step: z.string().catch(""),
      evidence_ids: ids,
    }),
    (o) => ({
      ...o,
      id: first(o, ["id", "opportunity_id"]),
      title: first(o, ["title", "name", "opportunity"]),
      for_product: first(o, ["for_product", "target", "product"]),
      evidence_ids: first(o, ["evidence_ids", "feedback_ids"]),
    }),
  ),
  limitations: z.array(z.coerce.string()).catch([]),
});
export type RawComparison = z.infer<typeof rawComparisonSchema>;

/* ---------------- grounded output ---------------- */

export interface ComparisonOutput {
  meta: { comparison_id: string; model: string; generated_at: string };
  products: Record<ProductKey, { name: string; analyzed_ids: string[]; records_received: number; duplicates_excluded: number }>;
  summary: string;
  labels: Record<string, { product: ProductKey; sentiment: Sentiment; theme_id: string | null }>;
  themes: { id: string; name: string; description: string; severity: Severity }[];
  feature_requests: { id: string; title: string; description: string; feedback_ids: string[] }[];
  opportunities: {
    id: string;
    title: string;
    description: string;
    for_product: ProductKey | "both";
    next_step: string;
    evidence_ids: string[];
  }[];
  limitations: string[];
  verification: { unknown_ids_removed: number; unlabeled_records: number; insights_dropped_no_evidence: number };
}

export type CompareProductsResponse =
  | { ok: true; data: ComparisonOutput }
  | { ok: false; error: { code: AnalyzeFeedbackErrorCode; message: string } };

export function groundComparison(
  raw: RawComparison,
  ctx: {
    sides: Extract<PrepareComparisonResult, { ok: true }>["sides"];
    id: string;
    model: string;
    createdAt: string;
  },
): ComparisonOutput {
  const productOf = new Map<string, ProductKey>();
  for (const k of PRODUCT_KEYS) for (const id of ctx.sides[k].analyzedIds) productOf.set(id, k);
  let unknown = 0;
  let dropped = 0;
  const keep = (list: string[]) => {
    const out: string[] = [];
    for (const id of list) {
      if (!productOf.has(id)) unknown++;
      else if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  const themeIds = new Set<string>();
  const themesRaw = raw.themes.filter((t) => (themeIds.has(t.id) ? false : (themeIds.add(t.id), true)));

  const labels: ComparisonOutput["labels"] = {};
  for (const l of raw.item_labels) {
    const product = productOf.get(l.id);
    if (!product) {
      unknown++;
      continue;
    }
    if (labels[l.id]) continue;
    labels[l.id] = { product, sentiment: l.sentiment, theme_id: l.theme_id && themeIds.has(l.theme_id) ? l.theme_id : null };
  }
  const usedThemes = new Set(Object.values(labels).map((l) => l.theme_id));
  const themes = themesRaw.filter((t) => (usedThemes.has(t.id) ? true : (dropped++, false)));

  const feature_requests = raw.feature_requests.flatMap((f) => {
    const fids = keep(f.feedback_ids);
    if (fids.length === 0) {
      dropped++;
      return [];
    }
    return [{ id: f.id, title: f.title, description: f.description, feedback_ids: fids }];
  });

  const opportunities = raw.opportunities.flatMap((o) => {
    const ev = keep(o.evidence_ids);
    if (ev.length === 0) {
      dropped++;
      return [];
    }
    return [{ ...o, evidence_ids: ev }];
  });

  const products = {} as ComparisonOutput["products"];
  for (const k of PRODUCT_KEYS) {
    const s = ctx.sides[k];
    products[k] = { name: s.name, analyzed_ids: s.analyzedIds, records_received: s.recordsReceived, duplicates_excluded: s.duplicatesExcluded };
  }

  return {
    meta: { comparison_id: ctx.id, model: ctx.model, generated_at: ctx.createdAt },
    products,
    summary: raw.summary,
    labels,
    themes,
    feature_requests,
    opportunities,
    limitations: [...PRODUCT_KEYS.flatMap((k) => ctx.sides[k].limitations), ...raw.limitations],
    verification: {
      unknown_ids_removed: unknown,
      unlabeled_records: productOf.size - Object.keys(labels).length,
      insights_dropped_no_evidence: dropped,
    },
  };
}

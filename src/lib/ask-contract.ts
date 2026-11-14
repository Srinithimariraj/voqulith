/**
 * Contract + grounding for the `ask-feedback` backend function (Ask Your Feedback).
 * Pure and client-safe: used by the server function, its tests and the chat page.
 *
 * The AI only writes prose and points at feedback IDs. This module:
 * - keeps only IDs that exist in the data the user selected;
 * - keeps only quotes that are word-for-word excerpts, shown in the customer's own characters;
 * - computes every count, customer total and share itself (the AI writes placeholders);
 * - flags any number the AI wrote that the app did not compute;
 * - withholds an answer that cannot be linked to any feedback.
 */
import { z } from "zod";
import { feedbackRecordSchema, MAX_RECORDS, prepareRecords, type AnalyzeFeedbackErrorCode } from "./analysis-contract";
import { locateVerbatim } from "./grounding";
import type { AnalysisInputItem } from "./types";

/** At most this many unique records (shared fairly across selected products) go to the AI per question. */
export const MAX_ASK_UNIQUE = 600;
/** Only the most recent messages are sent as conversation context. */
export const MAX_HISTORY_MESSAGES = 12;
export const MAX_QUESTION_CHARS = 1000;

export const askFeedbackInputSchema = z
  .object({
    scope_label: z.string().trim().min(1).max(120),
    products: z
      .array(
        z.object({
          name: z.string().trim().min(1, "product name is required").max(80),
          records: z.array(feedbackRecordSchema).max(MAX_RECORDS, `At most ${MAX_RECORDS} records per product`),
        }),
      )
      .min(1, "Select at least one dataset")
      .max(20),
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1, "message is empty").max(8000),
        }),
      )
      .min(1, "Ask a question first")
      .max(60),
  })
  .superRefine((v, ctx) => {
    const last = v.messages[v.messages.length - 1];
    if (!last || last.role !== "user") ctx.addIssue({ code: "custom", message: "The last message must be a question", path: ["messages"] });
    else if (last.content.length > MAX_QUESTION_CHARS)
      ctx.addIssue({ code: "custom", message: `Questions can be up to ${MAX_QUESTION_CHARS} characters`, path: ["messages"] });
  });
export type AskFeedbackInput = z.infer<typeof askFeedbackInputSchema>;

export interface AskItem extends AnalysisInputItem {
  product: string;
}

export interface ScopeProduct {
  name: string;
  records: number;
  unique: number;
  analyzed: number;
  duplicates_excluded: number;
}

export type PrepareAskResult =
  | {
      ok: true;
      items: AskItem[];
      products: ScopeProduct[];
      limitations: string[];
      history: AskFeedbackInput["messages"];
    }
  | { ok: false; code: "invalid_input" | "empty_input"; message: string };

export function prepareAsk(input: AskFeedbackInput): PrepareAskResult {
  const items: AskItem[] = [];
  const products: ScopeProduct[] = [];
  const limitations: string[] = [];
  const seen = new Set<string>();
  const nonEmpty = input.products.filter((p) => p.records.some((r) => r.feedback_text.trim()));
  if (nonEmpty.length === 0) return { ok: false, code: "empty_input", message: "The selected data has no feedback to answer from." };
  const perProduct = Math.max(1, Math.floor(MAX_ASK_UNIQUE / nonEmpty.length));
  for (const p of nonEmpty) {
    const prepared = prepareRecords(p.records);
    if (!prepared.ok) return { ok: false, code: prepared.code, message: `${p.name}: ${prepared.message}` };
    for (const id of prepared.recordsById.keys()) {
      if (seen.has(id)) return { ok: false, code: "invalid_input", message: `feedback_id "${id}" appears in more than one dataset.` };
      seen.add(id);
    }
    let unique = prepared.items;
    const uniqueCount = unique.length;
    if (unique.length > perProduct) {
      limitations.push(`${p.name}: only the first ${perProduct} of ${unique.length} unique records were read for this answer.`);
      unique = unique.slice(0, perProduct);
    }
    for (const l of prepared.limitations) if (!l.startsWith("Only the first")) limitations.push(`${p.name}: ${l}`);
    items.push(...unique.map((u) => ({ ...u, product: p.name })));
    products.push({
      name: p.name,
      records: prepared.totalRecords,
      unique: uniqueCount,
      analyzed: unique.length,
      duplicates_excluded: prepared.duplicateGroups.reduce((s, g) => s + g.duplicate_feedback_ids.length, 0),
    });
  }
  const history = input.messages.slice(-MAX_HISTORY_MESSAGES);
  if (history[0]?.role === "assistant") history.shift();
  if (input.messages.length > history.length) {
    limitations.push("Only the most recent part of this conversation was used as context.");
  }
  return { ok: true, items, products, limitations, history };
}

/* ---------------- raw AI output (lenient) ---------------- */

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

export const rawAskSchema = z.object({
  answer: z.string().catch(""),
  status: z.enum(["answered", "partial", "insufficient"]).catch("partial"),
  findings: lenientArray(
    z.object({ id: z.string(), point: z.string().min(1), feedback_ids: z.array(z.coerce.string()).catch([]) }),
    (o) => ({
      ...o,
      id: first(o, ["id", "finding_id"]),
      point: first(o, ["point", "finding", "text", "title"]),
      feedback_ids: first(o, ["feedback_ids", "evidence_ids", "ids"]),
    }),
  ),
  quotes: lenientArray(
    z.object({ feedback_id: z.string().catch(""), quote: z.string().min(1) }),
    (o) => ({ ...o, feedback_id: first(o, ["feedback_id", "id"]), quote: first(o, ["quote", "text"]) }),
  ),
  limitations: z.array(z.coerce.string()).catch([]),
  follow_ups: z.array(z.coerce.string()).catch([]),
});
export type RawAsk = z.infer<typeof rawAskSchema>;

/* ---------------- grounded output ---------------- */

export type Segment = { t: "text"; v: string } | { t: "ref"; id: string };

export interface ProductCount {
  name: string;
  items: number;
  /** Share of that product's feedback read for this answer, 0-100, one decimal. */
  share: number;
}

export interface EvidenceCount {
  items: number;
  /** Distinct identified customer IDs (per product). */
  customers: number;
  /** Cited feedback with no customer ID — not merged into anyone. */
  unidentified: number;
  /** Share of all feedback read for this answer, 0-100, one decimal. */
  share: number;
  by_product: ProductCount[];
}

export interface AskAnswer {
  meta: { answer_id: string; model: string; generated_at: string };
  scope: { label: string; products: ScopeProduct[]; analyzed_items: number };
  status: "answered" | "partial" | "insufficient";
  /** True when the AI's draft cited no valid feedback and was replaced by an explanation. */
  withheld: boolean;
  answer: Segment[];
  findings: (EvidenceCount & { id: string; point: Segment[]; feedback_ids: string[] })[];
  quotes: { feedback_id: string; quote: string; product: string; source: string; customer_id: string | null }[];
  evidence: EvidenceCount & { feedback_ids: string[] };
  limitations: string[];
  follow_ups: string[];
  verification: {
    unknown_ids_removed: string[];
    quotes_proposed: number;
    quotes_rejected: number;
    findings_dropped_no_evidence: number;
    /** Numbers the AI wrote itself (outside quotes) that the app did not compute. */
    unverified_numbers: string[];
  };
}

export type AskFeedbackResponse =
  | { ok: true; data: AskAnswer }
  | { ok: false; error: { code: AnalyzeFeedbackErrorCode; message: string } };

export const WITHHELD_MESSAGE =
  "I couldn't link an answer to any feedback in the selected data, so I'm not giving one. The feedback may not cover this topic — try rephrasing, or choose a different dataset.";

const ID_LIKE = /^[A-Za-z]{1,6}\d*-\d{2,}$/;
const PLACEHOLDER = /\{\{\s*(items|customers|share|total_items|total_customers)\s*(?::\s*([A-Za-z0-9_-]+))?\s*\}\}/g;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export interface AskGroundingContext {
  items: AskItem[];
  products: ScopeProduct[];
  scopeLabel: string;
  id: string;
  model: string;
  createdAt: string;
  limitations?: string[];
}

export function countEvidence(ids: string[], lookup: Map<string, AskItem>, products: ScopeProduct[]): EvidenceCount {
  const customers = new Set<string>();
  let unidentified = 0;
  const perProduct = new Map<string, number>();
  for (const id of ids) {
    const it = lookup.get(id);
    if (!it) continue;
    const c = it.customer?.trim().toLowerCase();
    if (c) customers.add(`${it.product}|${c}`);
    else unidentified++;
    perProduct.set(it.product, (perProduct.get(it.product) ?? 0) + 1);
  }
  const total = products.reduce((s, p) => s + p.analyzed, 0);
  const items = ids.filter((id) => lookup.has(id)).length;
  return {
    items,
    customers: customers.size,
    unidentified,
    share: pct(items, total),
    by_product: products
      .filter((p) => perProduct.has(p.name))
      .map((p) => ({ name: p.name, items: perProduct.get(p.name) ?? 0, share: pct(perProduct.get(p.name) ?? 0, p.analyzed) })),
  };
}

/** Numbers the AI typed itself, ignoring quoted customer text, feedback IDs and app placeholders. */
export function findUnverifiedNumbers(text: string): string[] {
  const stripped = text
    .replace(PLACEHOLDER, " ")
    .replace(/^\s*\d+[.)]\s/gm, " ")
    .replace(/“[^”]*”|"[^"]*"/g, " ")
    .replace(/\b[A-Za-z]{1,6}\d*-\d{2,}\b/g, " ");
  const out: string[] = [];
  const re = /(?<![A-Za-z\d_-])\d[\d,.]*(?:\s?(?:%|percent\b|[A-Za-z]+))?/g;
  for (const m of stripped.matchAll(re)) {
    const v = m[0].trim();
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function groundAsk(raw: RawAsk, ctx: AskGroundingContext): AskAnswer {
  const lookup = new Map(ctx.items.map((i) => [i.id, i]));
  const unknown: string[] = [];
  const noteUnknown = (id: string) => {
    if (!unknown.includes(id)) unknown.push(id);
  };
  const clean = (list: string[]) => {
    const out: string[] = [];
    for (const r of list) {
      const id = r.trim().replace(/^\[|\]$/g, "");
      if (!id) continue;
      if (!lookup.has(id)) noteUnknown(id);
      else if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  // Findings first: placeholders in prose refer to them.
  let dropped = 0;
  const findingIds = new Set<string>();
  const findingsRaw = raw.findings.flatMap((f) => {
    const ids = clean(f.feedback_ids);
    if (ids.length === 0 || findingIds.has(f.id)) {
      if (ids.length === 0) dropped++;
      return [];
    }
    findingIds.add(f.id);
    return [{ id: f.id, point: f.point, feedback_ids: ids, ...countEvidence(ids, lookup, ctx.products) }];
  });
  const byFinding = new Map(findingsRaw.map((f) => [f.id, f]));

  // Quotes: verbatim only, displayed using the original characters.
  let rejected = 0;
  const seenQuotes = new Set<string>();
  const quotes: AskAnswer["quotes"] = [];
  for (const q of raw.quotes) {
    let item = lookup.get(q.feedback_id.trim().replace(/^\[|\]$/g, ""));
    let exact = item ? locateVerbatim(q.quote, item.text) : null;
    if (!item) {
      if (q.feedback_id.trim()) noteUnknown(q.feedback_id.trim());
      // Missing/invalid ID: attach only if the excerpt appears in exactly one record.
      const matches = ctx.items.filter((i) => locateVerbatim(q.quote, i.text) !== null);
      if (matches.length === 1) {
        item = matches[0];
        exact = item ? locateVerbatim(q.quote, item.text) : null;
      }
    }
    if (!item || !exact) {
      rejected++;
      continue;
    }
    const key = `${item.id}|${exact}`;
    if (seenQuotes.has(key)) continue;
    seenQuotes.add(key);
    quotes.push({ feedback_id: item.id, quote: exact, product: item.product, source: item.source, customer_id: item.customer?.trim() || null });
  }

  const inlineRefs: string[] = [];
  const unverified: string[] = [];
  const totalEvidenceForTotals = countEvidence(
    ctx.items.map((i) => i.id),
    lookup,
    ctx.products,
  );

  const fillPlaceholders = (text: string) =>
    text.replace(PLACEHOLDER, (_m, kind: string, fid?: string) => {
      if (kind === "total_items") return String(totalEvidenceForTotals.items);
      if (kind === "total_customers") return String(totalEvidenceForTotals.customers);
      const f = fid ? byFinding.get(fid) : undefined;
      if (!f) return "(not computed)";
      if (kind === "items") return String(f.items);
      if (kind === "customers") return String(f.customers);
      return `${f.share}%`;
    });

  /** Prose → segments: valid IDs become refs, invalid ones are removed. */
  const toSegments = (prose: string): Segment[] => {
    for (const n of findUnverifiedNumbers(prose)) if (!unverified.includes(n)) unverified.push(n);
    const text = fillPlaceholders(prose);
    const segs: Segment[] = [];
    const pushText = (v: string) => {
      if (!v) return;
      const last = segs[segs.length - 1];
      if (last?.t === "text") last.v += v;
      else segs.push({ t: "text", v });
    };
    const re = /\[([^\]\n]{1,300})\]|\b([A-Za-z]{1,6}\d*-\d{2,})\b/g;
    let at = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const inBracket = m[1];
      if (inBracket !== undefined) {
        const tokens = inBracket.split(/[\s,;]+/).filter(Boolean);
        if (!tokens.every((t) => ID_LIKE.test(t))) continue; // ordinary bracketed text
        pushText(text.slice(at, start));
        tokens.forEach((t) => {
          if (lookup.has(t)) {
            segs.push({ t: "ref", id: t });
            if (!inlineRefs.includes(t)) inlineRefs.push(t);
          } else noteUnknown(t);
        });
      } else {
        const id = m[2];
        if (!id) continue;
        pushText(text.slice(at, start));
        if (lookup.has(id)) {
          segs.push({ t: "ref", id });
          if (!inlineRefs.includes(id)) inlineRefs.push(id);
        } else {
          noteUnknown(id);
          pushText("(unverified ID removed)");
        }
      }
      at = start + m[0].length;
    }
    pushText(text.slice(at));
    for (const s of segs) if (s.t === "text") s.v = s.v.replace(/[ \t]+([.,;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
    return segs;
  };

  const findings = findingsRaw.map((f) => ({ ...f, point: toSegments(f.point) }));
  let answer = toSegments(raw.answer.trim());

  const evidenceIds: string[] = [];
  for (const id of [...findings.flatMap((f) => f.feedback_ids), ...quotes.map((q) => q.feedback_id), ...inlineRefs]) {
    if (!evidenceIds.includes(id)) evidenceIds.push(id);
  }

  const limitations = [...(ctx.limitations ?? []), ...raw.limitations.map((l) => l.trim()).filter(Boolean)];
  let status = raw.status;
  let withheld = false;
  if (evidenceIds.length === 0 && status !== "insufficient") {
    withheld = true;
    status = "insufficient";
    answer = [{ t: "text", v: WITHHELD_MESSAGE }];
    limitations.unshift("The AI's draft answer did not cite any feedback in the selected data, so it was withheld.");
  }
  if (!answer.some((s) => (s.t === "text" ? s.v.trim() : true))) {
    answer = [{ t: "text", v: status === "insufficient" ? WITHHELD_MESSAGE : "See the findings below." }];
  }
  if (status === "answered" && (dropped > 0 || rejected > 0) && findings.length === 0) status = "partial";

  return {
    meta: { answer_id: ctx.id, model: ctx.model, generated_at: ctx.createdAt },
    scope: { label: ctx.scopeLabel, products: ctx.products, analyzed_items: ctx.items.length },
    status,
    withheld,
    answer,
    findings: withheld ? [] : findings,
    quotes: withheld ? [] : quotes,
    evidence: { feedback_ids: withheld ? [] : evidenceIds, ...countEvidence(withheld ? [] : evidenceIds, lookup, ctx.products) },
    limitations,
    follow_ups: raw.follow_ups.map((f) => f.trim().slice(0, 160)).filter(Boolean).slice(0, 3),
    verification: {
      unknown_ids_removed: unknown,
      quotes_proposed: raw.quotes.length,
      quotes_rejected: rejected,
      findings_dropped_no_evidence: dropped,
      unverified_numbers: withheld ? [] : unverified,
    },
  };
}

/** Plain-text form of a grounded answer, sent back as conversation context for follow-ups. */
export function answerToHistoryText(a: AskAnswer): string {
  const seg = (s: Segment[]) => s.map((x) => (x.t === "text" ? x.v : `[${x.id}]`)).join("");
  const parts = [`(status: ${a.status}; data: ${a.scope.label})`, seg(a.answer)];
  if (a.findings.length) {
    parts.push("Findings:");
    a.findings.forEach((f, i) => parts.push(`${i + 1}. (${f.id}) ${seg(f.point)} [${f.feedback_ids.join(", ")}]`));
  }
  if (a.quotes.length) {
    parts.push("Quotes shown:");
    a.quotes.forEach((q, i) => parts.push(`${i + 1}. [${q.feedback_id}] "${q.quote}"`));
  }
  return parts.join("\n").slice(0, 7900);
}

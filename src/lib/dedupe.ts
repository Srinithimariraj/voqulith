import type { FeedbackItem } from "./types";

/** Lowercase, strip punctuation/emoji, collapse whitespace. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalizeText(text).split(" ").filter(Boolean));
}

export function jaccard(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export function customerKey(item: Pick<FeedbackItem, "id" | "customer">): string {
  const c = item.customer?.trim().toLowerCase();
  return c ? `c:${c}` : `anon:${item.id}`;
}

export interface DedupeResult {
  /** Canonical (first-seen) items, in original order. */
  unique: FeedbackItem[];
  /** duplicate id -> canonical id */
  duplicateOf: Record<string, string>;
  /** canonical id -> number of extra copies collapsed into it */
  copies: Record<string, number>;
}

/**
 * Duplicate rules:
 *  - identical text after normalization (any customer, any source) is one piece of feedback;
 *  - the same identified customer repeating near-identical text (>= 85% word overlap) is one piece.
 * Different customers saying similar things are NOT duplicates — that is real frequency.
 */
export function dedupeFeedback(items: FeedbackItem[]): DedupeResult {
  const unique: FeedbackItem[] = [];
  const duplicateOf: Record<string, string> = {};
  const copies: Record<string, number> = {};
  const byNorm = new Map<string, string>();

  for (const item of items) {
    const norm = normalizeText(item.text);
    if (!norm) continue;
    let canonical = byNorm.get(norm);
    if (!canonical && item.customer?.trim()) {
      const key = customerKey(item);
      const match = unique.find(
        (u) => customerKey(u) === key && jaccard(u.text, item.text) >= 0.85,
      );
      canonical = match?.id;
    }
    if (canonical) {
      duplicateOf[item.id] = canonical;
      copies[canonical] = (copies[canonical] ?? 0) + 1;
      continue;
    }
    byNorm.set(norm, item.id);
    unique.push(item);
  }
  return { unique, duplicateOf, copies };
}

/** Count distinct customers behind a set of feedback IDs. Unidentified feedback counts once each. */
export function countCustomers(ids: string[], lookup: Map<string, FeedbackItem>): number {
  const keys = new Set<string>();
  for (const id of ids) {
    const item = lookup.get(id);
    if (item) keys.add(customerKey(item));
  }
  return keys.size;
}

/** Stable signature of the dataset so stale analyses can be detected. */
export function datasetSignature(items: FeedbackItem[]): string {
  let h = 5381;
  for (const it of items) {
    const s = `${it.id}|${it.text}|${it.source}|${it.customer ?? ""}`;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return `${items.length}-${(h >>> 0).toString(36)}`;
}

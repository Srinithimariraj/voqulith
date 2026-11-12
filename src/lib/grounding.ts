import { countCustomers, customerKey } from "./dedupe";
import type { RawAnalysis } from "./analysis-schema";
import type {
  AnalysisInputItem,
  AnalysisResult,
  ChurnSignal,
  FeedbackItem,
  Quote,
  Sentiment,
} from "./types";

/** Loose comparison so curly quotes, case and spacing don't reject a genuine verbatim excerpt. */
export function normalizeForQuote(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B`´]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .replace(/^["'\s.…-]+|["'\s.…-]+$/g, "")
    .trim();
}

/** A quote is accepted only if it appears word-for-word in the original feedback. */
export function isVerbatim(quote: string, original: string): boolean {
  const q = normalizeForQuote(quote);
  if (q.length < 4) return false;
  return normalizeForQuote(original).includes(q);
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const;
const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;
const RISK_ORDER = { high: 0, medium: 1, low: 2 } as const;

export interface GroundingContext {
  items: AnalysisInputItem[];
  totalFeedbackItems: number;
  model: string;
  datasetSignature: string;
  id: string;
  createdAt: string;
}

/**
 * Turn raw model output into a grounded result:
 * - every ID must reference feedback that was actually sent;
 * - quotes / churn evidence must be verbatim substrings of that feedback;
 * - counts, percentages and affected customers are computed here, never taken from the model;
 * - insights left with no valid evidence are dropped.
 */
export function groundAnalysis(raw: RawAnalysis, ctx: GroundingContext): AnalysisResult {
  const lookup = new Map<string, FeedbackItem>();
  for (const it of ctx.items) {
    lookup.set(it.id, {
      id: it.id,
      text: it.text,
      source: it.source as FeedbackItem["source"],
      customer: it.customer,
      origin: "manual",
      createdAt: "",
    });
  }
  const total = ctx.items.length;
  let unknownIdsRemoved = 0;
  let insightsDroppedNoEvidence = 0;

  const clean = (list: string[]): string[] => {
    const out: string[] = [];
    for (const raw of list) {
      const id = raw.trim().replace(/^\[|\]$/g, "");
      if (!lookup.has(id)) {
        unknownIdsRemoved++;
        continue;
      }
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  // Per-item labels
  const itemLabels: AnalysisResult["itemLabels"] = {};
  for (const l of raw.item_labels) {
    if (lookup.has(l.id)) itemLabels[l.id] = { sentiment: l.sentiment, themeId: l.theme_id };
    else unknownIdsRemoved++;
  }
  const sentiment = { positive: 0, neutral: 0, negative: 0, mixed: 0, unlabeled: 0 };
  for (const it of ctx.items) {
    const lab = itemLabels[it.id];
    if (lab) sentiment[lab.sentiment]++;
    else sentiment.unlabeled++;
  }

  // Themes: membership = union of declared ids and item labels pointing at the theme
  const themes = raw.themes
    .map((t) => {
      const fromLabels = Object.entries(itemLabels)
        .filter(([, l]) => l.themeId === t.id)
        .map(([id]) => id);
      const feedbackIds = clean([...t.feedback_ids, ...fromLabels]);
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        sentiment: t.sentiment,
        severity: t.severity,
        feedbackIds,
        count: feedbackIds.length,
        percentage: total ? Math.round((feedbackIds.length / total) * 1000) / 10 : 0,
        customers: countCustomers(feedbackIds, lookup),
        confidence: t.confidence,
      };
    })
    .filter((t) => {
      if (t.count === 0) insightsDroppedNoEvidence++;
      return t.count > 0;
    })
    .sort((a, b) => b.count - a.count);
  const themeIds = new Set(themes.map((t) => t.id));

  const painPoints = raw.pain_points
    .map((p) => {
      const feedbackIds = clean(p.feedback_ids);
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        severity: p.severity,
        themeId: p.theme_id && themeIds.has(p.theme_id) ? p.theme_id : null,
        feedbackIds,
        frequency: feedbackIds.length,
        customers: countCustomers(feedbackIds, lookup),
      };
    })
    .filter((p) => {
      if (p.frequency === 0) insightsDroppedNoEvidence++;
      return p.frequency > 0;
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.frequency - a.frequency);

  // Quotes: verbatim only
  let quotesRejected = 0;
  const seenQuotes = new Set<string>();
  const quotes: Quote[] = [];
  for (const q of raw.quotes) {
    const item = lookup.get(q.feedback_id.trim());
    if (!item || !isVerbatim(q.quote, item.text)) {
      quotesRejected++;
      continue;
    }
    const key = `${item.id}|${normalizeForQuote(q.quote)}`;
    if (seenQuotes.has(key)) continue;
    seenQuotes.add(key);
    quotes.push({
      feedbackId: item.id,
      quote: q.quote.trim(),
      themeId: q.theme_id && themeIds.has(q.theme_id) ? q.theme_id : (itemLabels[item.id]?.themeId ?? null),
      sentiment: q.sentiment as Sentiment,
    });
  }

  // Churn: verbatim evidence only, one signal per feedback+type
  let churnRejected = 0;
  const churnSeen = new Set<string>();
  const churnSignals: ChurnSignal[] = [];
  for (const c of raw.churn_signals) {
    const item = lookup.get(c.feedback_id.trim());
    if (!item || !isVerbatim(c.evidence, item.text)) {
      churnRejected++;
      continue;
    }
    const key = `${item.id}|${c.signal_type}`;
    if (churnSeen.has(key)) continue;
    churnSeen.add(key);
    churnSignals.push({
      feedbackId: item.id,
      type: c.signal_type,
      evidence: c.evidence.trim(),
      risk: c.risk_level,
      rationale: c.rationale,
      confidence: c.confidence,
      customer: item.customer?.trim() || null,
    });
  }
  churnSignals.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || b.confidence - a.confidence);

  const recommendations = raw.recommendations
    .map((r) => {
      const evidenceIds = clean(r.evidence_ids);
      return {
        id: r.id,
        title: r.title,
        problem: r.problem,
        evidenceIds,
        feedbackCount: evidenceIds.length,
        affectedCustomers: countCustomers(evidenceIds, lookup),
        businessImpact: r.business_impact,
        priority: r.priority,
        nextAction: r.next_action,
        confidence: r.confidence,
        assumptions: r.assumptions,
      };
    })
    .filter((r) => {
      if (r.feedbackCount === 0) insightsDroppedNoEvidence++;
      return r.feedbackCount > 0;
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.affectedCustomers - a.affectedCustomers);

  const keyFindings = raw.executive_summary.key_findings
    .map((f) => ({ text: f.finding, evidenceIds: clean(f.evidence_ids) }))
    .filter((f) => f.text.trim().length > 0);

  const allKeys = new Set(ctx.items.map((i) => customerKey(i)));
  const identified = ctx.items.filter((i) => i.customer?.trim()).map((i) => customerKey(i));

  return {
    id: ctx.id,
    createdAt: ctx.createdAt,
    model: ctx.model,
    datasetSignature: ctx.datasetSignature,
    totals: {
      feedbackItems: ctx.totalFeedbackItems,
      uniqueFeedback: total,
      duplicatesExcluded: Math.max(0, ctx.totalFeedbackItems - total),
      customers: allKeys.size,
      customersIdentified: new Set(identified).size,
    },
    executiveSummary: {
      summary: raw.executive_summary.summary,
      keyFindings,
      confidence: raw.executive_summary.confidence,
      assumptions: raw.executive_summary.assumptions,
      limitations: raw.executive_summary.limitations,
    },
    sentiment,
    itemLabels,
    themes,
    painPoints,
    quotes,
    churnSignals,
    recommendations,
    verification: {
      quotesProposed: raw.quotes.length,
      quotesRejected,
      churnProposed: raw.churn_signals.length,
      churnRejected,
      unknownIdsRemoved,
      insightsDroppedNoEvidence,
      unlabeledItems: sentiment.unlabeled,
    },
  };
}

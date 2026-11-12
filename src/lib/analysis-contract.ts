/**
 * Public contract of the `analyze-feedback` backend function.
 * Input: feedback records. Output: structured, evidence-linked JSON (snake_case).
 * Pure and client-safe: used by the server function and by the dashboard adapter.
 */
import { z } from "zod";
import { dedupeFeedback } from "./dedupe";
import type {
  AnalysisInputItem,
  AnalysisResult,
  ChurnType,
  FeedbackItem,
  Priority,
  RiskLevel,
  Sentiment,
  Severity,
} from "./types";

export const MAX_RECORDS = 2000;
export const MAX_UNIQUE_ANALYZED = 600;
export const MAX_TEXT_CHARS = 4000;
export const TOP_PAIN_POINTS = 5;

export const feedbackRecordSchema = z.object({
  feedback_id: z.string().trim().min(1, "feedback_id is required").max(64),
  source: z.string().trim().min(1, "source is required").max(60),
  customer_id: z.string().trim().max(120).nullish(),
  feedback_text: z.string().max(20000),
  date: z.string().trim().max(40).nullish(),
});
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

export const analyzeFeedbackInputSchema = z.object({
  records: z.array(feedbackRecordSchema).max(MAX_RECORDS, `At most ${MAX_RECORDS} records per request`),
});
export type AnalyzeFeedbackInput = z.infer<typeof analyzeFeedbackInputSchema>;

export interface DuplicateGroup {
  kept_feedback_id: string;
  duplicate_feedback_ids: string[];
}

export type PrepareResult =
  | {
      ok: true;
      items: AnalysisInputItem[];
      recordsById: Map<string, FeedbackRecord>;
      duplicateGroups: DuplicateGroup[];
      limitations: string[];
      totalRecords: number;
    }
  | { ok: false; code: "invalid_input" | "empty_input"; message: string };

/** Validate records, reject repeated IDs, collapse duplicate feedback, cap volume. */
export function prepareRecords(records: FeedbackRecord[]): PrepareResult {
  const usable = records.filter((r) => r.feedback_text.trim().length > 0);
  if (usable.length === 0) return { ok: false, code: "empty_input", message: "No feedback text to analyze." };

  const seen = new Set<string>();
  for (const r of usable) {
    if (seen.has(r.feedback_id)) {
      return { ok: false, code: "invalid_input", message: `feedback_id "${r.feedback_id}" appears more than once.` };
    }
    seen.add(r.feedback_id);
  }

  const asItems: FeedbackItem[] = usable.map((r) => ({
    id: r.feedback_id,
    text: r.feedback_text.trim(),
    source: r.source as FeedbackItem["source"],
    customer: r.customer_id?.trim() || undefined,
    date: r.date ?? undefined,
    origin: "manual",
    createdAt: "",
  }));
  const dedupe = dedupeFeedback(asItems);

  const groups = new Map<string, string[]>();
  for (const [dup, kept] of Object.entries(dedupe.duplicateOf)) {
    groups.set(kept, [...(groups.get(kept) ?? []), dup]);
  }

  const limitations: string[] = [];
  let unique = dedupe.unique;
  if (unique.length > MAX_UNIQUE_ANALYZED) {
    limitations.push(
      `Only the first ${MAX_UNIQUE_ANALYZED} of ${unique.length} unique records were analyzed; the rest are not reflected in any insight.`,
    );
    unique = unique.slice(0, MAX_UNIQUE_ANALYZED);
  }
  let truncated = 0;
  const items: AnalysisInputItem[] = unique.map((u) => {
    if (u.text.length > MAX_TEXT_CHARS) truncated++;
    return {
      id: u.id,
      text: u.text.slice(0, MAX_TEXT_CHARS),
      source: u.source,
      customer: u.customer,
      date: u.date,
      duplicateCount: dedupe.copies[u.id] ?? 0,
    };
  });
  if (truncated > 0) {
    limitations.push(`${truncated} long record(s) were cut to ${MAX_TEXT_CHARS} characters before analysis.`);
  }
  if (groups.size > 0) {
    limitations.push(
      `${Object.keys(dedupe.duplicateOf).length} duplicate record(s) were collapsed into the original and not counted as separate customers.`,
    );
  }

  return {
    ok: true,
    items,
    recordsById: new Map(usable.map((r) => [r.feedback_id, r])),
    duplicateGroups: [...groups.entries()].map(([kept, dups]) => ({
      kept_feedback_id: kept,
      duplicate_feedback_ids: dups,
    })),
    limitations,
    totalRecords: usable.length,
  };
}

/* ---------------- output contract ---------------- */

export interface AnalyzeFeedbackOutput {
  meta: { analysis_id: string; model: string; generated_at: string };
  executive_summary: {
    summary: string;
    key_findings: { finding: string; feedback_ids: string[] }[];
  };
  sentiment: {
    distribution: Record<Sentiment | "unlabeled", number>;
    classifications: { feedback_id: string; sentiment: Sentiment; theme_id: string | null }[];
  };
  top_pain_points: {
    id: string;
    title: string;
    description: string;
    severity: Severity;
    theme_id: string | null;
    feedback_ids: string[];
    frequency: number;
    affected_customers: number;
  }[];
  theme_clusters: {
    id: string;
    name: string;
    description: string;
    sentiment: Sentiment;
    severity: Severity;
    feedback_ids: string[];
    frequency: number;
    percentage: number;
    affected_customers: number;
    confidence: number;
  }[];
  theme_frequencies: { theme_id: string; name: string; frequency: number; percentage: number }[];
  customer_quotes: {
    feedback_id: string;
    quote: string;
    source: string;
    customer_id: string | null;
    theme_id: string | null;
    sentiment: Sentiment;
  }[];
  churn_signals: {
    feedback_id: string;
    customer_id: string | null;
    signal_type: ChurnType;
    risk_level: RiskLevel;
    evidence: string;
    rationale: string;
    confidence: number;
  }[];
  roadmap_recommendations: {
    id: string;
    title: string;
    problem: string;
    priority: Priority;
    feedback_ids: string[];
    feedback_count: number;
    affected_customers: number;
    business_impact: string;
    next_action: string;
    confidence: number;
    assumptions: string[];
  }[];
  confidence: { overall: number; level: "high" | "medium" | "low" };
  evidence_limitations: {
    limitations: string[];
    assumptions: string[];
    verification: {
      quotes_proposed: number;
      quotes_rejected_not_verbatim: number;
      churn_signals_proposed: number;
      churn_signals_rejected: number;
      unknown_feedback_ids_removed: number;
      insights_dropped_no_evidence: number;
      unlabeled_records: number;
    };
    dataset: {
      records_received: number;
      unique_records: number;
      duplicates_excluded: number;
      duplicate_groups: DuplicateGroup[];
      customers: number;
      customers_identified: number;
    };
  };
}

export type AnalyzeFeedbackErrorCode =
  | "invalid_input"
  | "empty_input"
  | "ai_credits_exhausted"
  | "ai_rate_limited"
  | "ai_timeout"
  | "ai_invalid_response"
  | "ai_error";

export type AnalyzeFeedbackResponse =
  | { ok: true; data: AnalyzeFeedbackOutput }
  | { ok: false; error: { code: AnalyzeFeedbackErrorCode; message: string } };

const level = (v: number) => (v >= 0.75 ? "high" : v >= 0.5 ? "medium" : "low") as const;

export function toApiResponse(
  r: AnalysisResult,
  ctx: { recordsById: Map<string, FeedbackRecord>; duplicateGroups: DuplicateGroup[]; limitations: string[] },
): AnalyzeFeedbackOutput {
  return {
    meta: { analysis_id: r.id, model: r.model, generated_at: r.createdAt },
    executive_summary: {
      summary: r.executiveSummary.summary,
      key_findings: r.executiveSummary.keyFindings.map((f) => ({ finding: f.text, feedback_ids: f.evidenceIds })),
    },
    sentiment: {
      distribution: { ...r.sentiment },
      classifications: Object.entries(r.itemLabels).map(([id, l]) => ({
        feedback_id: id,
        sentiment: l.sentiment,
        theme_id: l.themeId,
      })),
    },
    top_pain_points: r.painPoints.slice(0, TOP_PAIN_POINTS).map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      severity: p.severity,
      theme_id: p.themeId,
      feedback_ids: p.feedbackIds,
      frequency: p.frequency,
      affected_customers: p.customers,
    })),
    theme_clusters: r.themes.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      sentiment: t.sentiment,
      severity: t.severity,
      feedback_ids: t.feedbackIds,
      frequency: t.count,
      percentage: t.percentage,
      affected_customers: t.customers,
      confidence: t.confidence,
    })),
    theme_frequencies: r.themes.map((t) => ({
      theme_id: t.id,
      name: t.name,
      frequency: t.count,
      percentage: t.percentage,
    })),
    customer_quotes: r.quotes.map((q) => {
      const rec = ctx.recordsById.get(q.feedbackId);
      return {
        feedback_id: q.feedbackId,
        quote: q.quote,
        source: rec?.source ?? "",
        customer_id: rec?.customer_id?.trim() || null,
        theme_id: q.themeId,
        sentiment: q.sentiment,
      };
    }),
    churn_signals: r.churnSignals.map((c) => ({
      feedback_id: c.feedbackId,
      customer_id: c.customer,
      signal_type: c.type,
      risk_level: c.risk,
      evidence: c.evidence,
      rationale: c.rationale,
      confidence: c.confidence,
    })),
    roadmap_recommendations: r.recommendations.map((x) => ({
      id: x.id,
      title: x.title,
      problem: x.problem,
      priority: x.priority,
      feedback_ids: x.evidenceIds,
      feedback_count: x.feedbackCount,
      affected_customers: x.affectedCustomers,
      business_impact: x.businessImpact,
      next_action: x.nextAction,
      confidence: x.confidence,
      assumptions: x.assumptions,
    })),
    confidence: { overall: r.executiveSummary.confidence, level: level(r.executiveSummary.confidence) },
    evidence_limitations: {
      limitations: [...ctx.limitations, ...r.executiveSummary.limitations],
      assumptions: [
        "Records without a customer_id are each counted as a separate customer.",
        ...r.executiveSummary.assumptions,
      ],
      verification: {
        quotes_proposed: r.verification.quotesProposed,
        quotes_rejected_not_verbatim: r.verification.quotesRejected,
        churn_signals_proposed: r.verification.churnProposed,
        churn_signals_rejected: r.verification.churnRejected,
        unknown_feedback_ids_removed: r.verification.unknownIdsRemoved,
        insights_dropped_no_evidence: r.verification.insightsDroppedNoEvidence,
        unlabeled_records: r.verification.unlabeledItems,
      },
      dataset: {
        records_received: r.totals.feedbackItems,
        unique_records: r.totals.uniqueFeedback,
        duplicates_excluded: r.totals.duplicatesExcluded,
        duplicate_groups: ctx.duplicateGroups,
        customers: r.totals.customers,
        customers_identified: r.totals.customersIdentified,
      },
    },
  };
}

/** Convert the API output into the app's display model. */
export function fromApiResponse(o: AnalyzeFeedbackOutput, datasetSignature: string): AnalysisResult {
  const v = o.evidence_limitations.verification;
  const d = o.evidence_limitations.dataset;
  return {
    id: o.meta.analysis_id,
    createdAt: o.meta.generated_at,
    model: o.meta.model,
    datasetSignature,
    totals: {
      feedbackItems: d.records_received,
      uniqueFeedback: d.unique_records,
      duplicatesExcluded: d.duplicates_excluded,
      customers: d.customers,
      customersIdentified: d.customers_identified,
    },
    executiveSummary: {
      summary: o.executive_summary.summary,
      keyFindings: o.executive_summary.key_findings.map((f) => ({ text: f.finding, evidenceIds: f.feedback_ids })),
      confidence: o.confidence.overall,
      assumptions: o.evidence_limitations.assumptions,
      limitations: o.evidence_limitations.limitations,
    },
    sentiment: { ...o.sentiment.distribution },
    itemLabels: Object.fromEntries(
      o.sentiment.classifications.map((c) => [c.feedback_id, { sentiment: c.sentiment, themeId: c.theme_id }]),
    ),
    themes: o.theme_clusters.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      sentiment: t.sentiment,
      severity: t.severity,
      feedbackIds: t.feedback_ids,
      count: t.frequency,
      percentage: t.percentage,
      customers: t.affected_customers,
      confidence: t.confidence,
    })),
    painPoints: o.top_pain_points.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      severity: p.severity,
      themeId: p.theme_id,
      feedbackIds: p.feedback_ids,
      frequency: p.frequency,
      customers: p.affected_customers,
    })),
    quotes: o.customer_quotes.map((q) => ({
      feedbackId: q.feedback_id,
      quote: q.quote,
      themeId: q.theme_id,
      sentiment: q.sentiment,
    })),
    churnSignals: o.churn_signals.map((c) => ({
      feedbackId: c.feedback_id,
      type: c.signal_type,
      evidence: c.evidence,
      risk: c.risk_level,
      rationale: c.rationale,
      confidence: c.confidence,
      customer: c.customer_id,
    })),
    recommendations: o.roadmap_recommendations.map((x) => ({
      id: x.id,
      title: x.title,
      problem: x.problem,
      evidenceIds: x.feedback_ids,
      affectedCustomers: x.affected_customers,
      feedbackCount: x.feedback_count,
      businessImpact: x.business_impact,
      priority: x.priority,
      nextAction: x.next_action,
      confidence: x.confidence,
      assumptions: x.assumptions,
    })),
    verification: {
      quotesProposed: v.quotes_proposed,
      quotesRejected: v.quotes_rejected_not_verbatim,
      churnProposed: v.churn_signals_proposed,
      churnRejected: v.churn_signals_rejected,
      unknownIdsRemoved: v.unknown_feedback_ids_removed,
      insightsDroppedNoEvidence: v.insights_dropped_no_evidence,
      unlabeledItems: v.unlabeled_records,
    },
  };
}

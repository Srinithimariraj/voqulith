import { z } from "zod";

const sentiment = z.enum(["positive", "neutral", "negative", "mixed"]).catch("neutral");
const severity = z.enum(["critical", "high", "medium", "low"]).catch("medium");
const conf = z.coerce.number().min(0).max(1).catch(0.5);
const ids = z.array(z.string()).catch([]);
const strs = z.array(z.string()).catch([]);

/** Shape the model is asked to return. Parsing is lenient; grounding happens afterwards. */
export const rawAnalysisSchema = z.object({
  executive_summary: z
    .object({
      summary: z.string().catch(""),
      key_findings: z
        .array(z.object({ finding: z.string(), evidence_ids: ids }))
        .catch([]),
      confidence: conf,
      assumptions: strs,
      limitations: strs,
    })
    .catch({ summary: "", key_findings: [], confidence: 0.5, assumptions: [], limitations: [] }),
  item_labels: z
    .array(z.object({ id: z.string(), sentiment, theme_id: z.string().nullable().catch(null) }))
    .catch([]),
  themes: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().catch(""),
        sentiment,
        severity,
        feedback_ids: ids,
        confidence: conf,
      }),
    )
    .catch([]),
  pain_points: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string().catch(""),
        severity,
        theme_id: z.string().nullable().catch(null),
        feedback_ids: ids,
      }),
    )
    .catch([]),
  quotes: z
    .array(
      z.object({
        feedback_id: z.string(),
        quote: z.string(),
        theme_id: z.string().nullable().catch(null),
        sentiment,
      }),
    )
    .catch([]),
  churn_signals: z
    .array(
      z.object({
        feedback_id: z.string(),
        signal_type: z
          .enum([
            "cancellation_intent",
            "uninstall_intent",
            "repeated_unresolved_complaint",
            "refund_frustration",
            "competitor_switch",
          ])
          .catch("repeated_unresolved_complaint"),
        evidence: z.string(),
        risk_level: z.enum(["high", "medium", "low"]).catch("medium"),
        rationale: z.string().catch(""),
        confidence: conf,
      }),
    )
    .catch([]),
  recommendations: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        problem: z.string().catch(""),
        evidence_ids: ids,
        business_impact: z.string().catch(""),
        priority: z.enum(["P0", "P1", "P2"]).catch("P2"),
        next_action: z.string().catch(""),
        confidence: conf,
        assumptions: strs,
      }),
    )
    .catch([]),
});

export type RawAnalysis = z.infer<typeof rawAnalysisSchema>;

import { z } from "zod";

const sentiment = z.enum(["positive", "neutral", "negative", "mixed"]).catch("neutral");
const severity = z.enum(["critical", "high", "medium", "low"]).catch("medium");
const conf = z.coerce.number().min(0).max(1).catch(0.5);
const ids = z.array(z.coerce.string()).catch([]);
const strs = z.array(z.coerce.string()).catch([]);

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const first = (o: Obj, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** Parse each element on its own so one malformed entry never discards the whole list. */
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

const keyFinding = z.object({ finding: z.string(), evidence_ids: ids });

/** Shape the model is asked to return. Parsing is lenient (common key aliases accepted); grounding happens afterwards. */
export const rawAnalysisSchema = z.object({
  executive_summary: z
    .preprocess(
      (v) => {
        const o = asObj(v);
        return { ...o, summary: first(o, ["summary", "overview", "text"]) };
      },
      z.object({
        summary: z.string().catch(""),
        key_findings: lenientArray(keyFinding, (o) => ({
          ...o,
          finding: first(o, ["finding", "text", "title", "insight"]),
          evidence_ids: first(o, ["evidence_ids", "feedback_ids", "evidence"]),
        })),
        confidence: conf,
        assumptions: strs,
        limitations: strs,
      }),
    )
    .catch({ summary: "", key_findings: [], confidence: 0.5, assumptions: [], limitations: [] }),
  item_labels: lenientArray(
    z.object({ id: z.string(), sentiment, theme_id: z.string().nullable().catch(null) }),
    (o) => ({ ...o, id: first(o, ["id", "feedback_id"]) }),
  ),
  themes: lenientArray(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().catch(""),
      sentiment,
      severity,
      feedback_ids: ids,
      confidence: conf,
    }),
    (o) => ({
      ...o,
      id: first(o, ["id", "theme_id"]),
      name: first(o, ["name", "title"]),
      sentiment: first(o, ["sentiment", "overall_sentiment"]),
    }),
  ),
  pain_points: lenientArray(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().catch(""),
      severity,
      theme_id: z.string().nullable().catch(null),
      feedback_ids: ids,
    }),
    (o) => ({ ...o, id: first(o, ["id", "pain_point_id"]), title: first(o, ["title", "name"]) }),
  ),
  quotes: lenientArray(
    z.object({
      feedback_id: z.string().catch(""),
      quote: z.string(),
      theme_id: z.string().nullable().catch(null),
      sentiment,
    }),
    (o) => ({ ...o, feedback_id: first(o, ["feedback_id", "id"]), quote: first(o, ["quote", "text"]) }),
  ),
  churn_signals: lenientArray(
    z.object({
      feedback_id: z.string().catch(""),
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
    (o) => ({
      ...o,
      feedback_id: first(o, ["feedback_id", "id"]),
      signal_type: first(o, ["signal_type", "type"]),
      evidence: first(o, ["evidence", "quote"]),
      risk_level: first(o, ["risk_level", "risk"]),
    }),
  ),
  recommendations: lenientArray(
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
    (o) => ({
      ...o,
      id: first(o, ["id", "recommendation_id"]),
      title: first(o, ["title", "recommendation", "name"]),
      evidence_ids: first(o, ["evidence_ids", "feedback_ids"]),
    }),
  ),
});

export type RawAnalysis = z.infer<typeof rawAnalysisSchema>;

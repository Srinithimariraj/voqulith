import { describe, expect, it } from "vitest";
import { rawAnalysisSchema } from "./analysis-schema";
import { groundAnalysis, isVerbatim } from "./grounding";

const items = [
  { id: "FB-0001", text: "The refund took 12 days and support kept saying “escalated”.", source: "Email", customer: "C1", duplicateCount: 0 },
  { id: "FB-0002", text: "Uninstalling. Payment failed three times.", source: "Play Store", customer: "C2", duplicateCount: 1 },
  { id: "FB-0003", text: "Refund still pending for a week.", source: "Support Ticket", customer: "C1", duplicateCount: 0 },
];
const ctx = { items, totalFeedbackItems: 4, model: "m", datasetSignature: "s", id: "a", createdAt: "t" };

function raw(overrides: Record<string, unknown>) {
  return rawAnalysisSchema.parse({ executive_summary: { summary: "x" }, ...overrides });
}

describe("quote grounding", () => {
  it("accepts an exact excerpt despite curly quotes and case", () => {
    expect(isVerbatim('support kept saying "escalated"', items[0]!.text)).toBe(true);
  });
  it("rejects a paraphrased quote", () => {
    expect(isVerbatim("the refund took almost two weeks", items[0]!.text)).toBe(false);
  });
  it("drops quotes and churn signals whose text is not in the original", () => {
    const r = groundAnalysis(
      raw({
        quotes: [
          { feedback_id: "FB-0002", quote: "Payment failed three times", theme_id: null, sentiment: "negative" },
          { feedback_id: "FB-0002", quote: "Payment never works", theme_id: null, sentiment: "negative" },
        ],
        churn_signals: [
          { feedback_id: "FB-0002", signal_type: "uninstall_intent", evidence: "Uninstalling.", risk_level: "high", rationale: "", confidence: 0.9 },
          { feedback_id: "FB-0002", signal_type: "competitor_switch", evidence: "Moving to Swiggy now", risk_level: "high", rationale: "", confidence: 0.9 },
        ],
      }),
      ctx,
    );
    expect(r.quotes).toHaveLength(1);
    expect(r.verification.quotesRejected).toBe(1);
    expect(r.churnSignals).toHaveLength(1);
    expect(r.verification.churnRejected).toBe(1);
  });
});

describe("evidence linking", () => {
  it("removes unknown feedback IDs and drops recommendations with no valid evidence", () => {
    const r = groundAnalysis(
      raw({
        recommendations: [
          { id: "R1", title: "Fix refunds", evidence_ids: ["FB-0001", "FB-0003", "FB-0500"], priority: "P0" },
          { id: "R2", title: "Invented", evidence_ids: ["FB-9999"], priority: "P1" },
        ],
      }),
      ctx,
    );
    expect(r.recommendations.map((x) => x.id)).toEqual(["R1"]);
    expect(r.recommendations[0]!.evidenceIds).toEqual(["FB-0001", "FB-0003"]);
    expect(r.verification.unknownIdsRemoved).toBe(2);
  });

  it("counts affected customers as distinct people, not feedback items", () => {
    const r = groundAnalysis(
      raw({ recommendations: [{ id: "R1", title: "Fix refunds", evidence_ids: ["FB-0001", "FB-0003"], priority: "P0" }] }),
      ctx,
    );
    expect(r.recommendations[0]!.feedbackCount).toBe(2);
    expect(r.recommendations[0]!.affectedCustomers).toBe(1);
  });

  it("computes theme percentage from unique feedback", () => {
    const r = groundAnalysis(
      raw({ themes: [{ id: "T1", name: "Refunds", feedback_ids: ["FB-0001", "FB-0003"], sentiment: "negative", severity: "high" }] }),
      ctx,
    );
    expect(r.themes[0]!.count).toBe(2);
    expect(r.themes[0]!.percentage).toBe(66.7);
    expect(r.totals.duplicatesExcluded).toBe(1);
  });
});

describe("lenient parsing", () => {
  it("accepts feedback_id as an alias for item label id", () => {
    const r = groundAnalysis(
      raw({ item_labels: [{ feedback_id: "FB-0001", sentiment: "negative", theme_id: null }] }),
      ctx,
    );
    expect(r.sentiment.negative).toBe(1);
    expect(r.sentiment.unlabeled).toBe(2);
  });
  it("attaches a churn signal without an ID only when its evidence matches one feedback", () => {
    const r = groundAnalysis(
      raw({ churn_signals: [{ signal_type: "uninstall_intent", evidence: "Uninstalling.", risk_level: "high" }] }),
      ctx,
    );
    expect(r.churnSignals[0]?.feedbackId).toBe("FB-0002");
  });
});

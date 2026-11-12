import { describe, expect, it } from "vitest";
import { rawAnalysisSchema } from "./analysis-schema";
import { analyzeFeedbackInputSchema, fromApiResponse, prepareRecords, toApiResponse, TOP_PAIN_POINTS } from "./analysis-contract";
import { groundAnalysis } from "./grounding";

const rec = (id: string, text: string, customer: string | null = null) => ({
  feedback_id: id,
  source: "Play Store",
  customer_id: customer,
  feedback_text: text,
  date: "2026-10-01",
});

describe("analyze-feedback input", () => {
  it("rejects a record without feedback_id", () => {
    const r = analyzeFeedbackInputSchema.safeParse({ records: [{ source: "x", feedback_text: "hi" }] });
    expect(r.success).toBe(false);
  });

  it("rejects the same feedback_id twice", () => {
    const r = prepareRecords([rec("A", "late"), rec("A", "cold")]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_input");
  });

  it("collapses identical feedback so it is analyzed and counted once", () => {
    const r = prepareRecords([rec("A", "Refund not received", "C1"), rec("B", "Refund not received!", "C2"), rec("C", "Food was cold", "C3")]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items.map((i) => i.id)).toEqual(["A", "C"]);
      expect(r.duplicateGroups).toEqual([{ kept_feedback_id: "A", duplicate_feedback_ids: ["B"] }]);
      expect(r.items[0]!.duplicateCount).toBe(1);
    }
  });

  it("rejects input with no feedback text", () => {
    const r = prepareRecords([rec("A", "   ")]);
    expect(r.ok).toBe(false);
  });
});

describe("analyze-feedback output", () => {
  const prepared = prepareRecords([rec("A", "Refund not received after 9 days", "C1"), rec("B", "Uninstalling, app crashes", "C2")]);
  if (!prepared.ok) throw new Error("setup");
  const grounded = groundAnalysis(
    rawAnalysisSchema.parse({
      executive_summary: { summary: "s", confidence: 0.8 },
      pain_points: Array.from({ length: 7 }, (_, i) => ({ id: `P${i}`, title: `p${i}`, severity: "high", feedback_ids: ["A"] })),
      quotes: [{ feedback_id: "A", quote: "Refund not received", theme_id: null, sentiment: "negative" }],
    }),
    { items: prepared.items, totalFeedbackItems: 2, model: "m", datasetSignature: "", id: "x", createdAt: "t" },
  );
  const out = toApiResponse(grounded, prepared);

  it("returns at most 5 pain points", () => {
    expect(out.top_pain_points).toHaveLength(TOP_PAIN_POINTS);
  });

  it("returns quotes with their feedback ID, source and customer", () => {
    expect(out.customer_quotes[0]).toMatchObject({ feedback_id: "A", quote: "Refund not received", source: "Play Store", customer_id: "C1" });
  });

  it("round-trips into the dashboard model", () => {
    const back = fromApiResponse(out, "sig");
    expect(back.quotes[0]!.feedbackId).toBe("A");
    expect(back.datasetSignature).toBe("sig");
    expect(back.executiveSummary.confidence).toBe(0.8);
  });
});

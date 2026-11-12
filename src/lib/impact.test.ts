import { describe, expect, it } from "vitest";
import {
  affectedCustomers,
  buildPopulation,
  compareCounts,
  complaintTrend,
  defaultRanges,
  detectNumericOrder,
  impactRows,
  parseFeedbackDate,
  periodStats,
} from "./impact";
import type { AnalysisResult, FeedbackItem } from "./types";

const fb = (id: string, customer: string | undefined, date: string | undefined): FeedbackItem => ({
  id,
  text: `text ${id}`,
  source: "Email",
  customer,
  date,
  origin: "manual",
  createdAt: "2026-11-01T00:00:00Z",
});

describe("affected customers", () => {
  it("counts each customer ID once and reports feedback without an ID separately", () => {
    const pop = buildPopulation([fb("A", "C1", undefined), fb("B", " c1 ", undefined), fb("C", "C2", undefined), fb("D", undefined, undefined)]);
    expect(affectedCustomers(["A", "B", "C", "D"], pop.byId)).toEqual({ customers: 2, unidentified: 1 });
  });

  it("computes percentage of total unique feedback from linked IDs only", () => {
    const pop = buildPopulation([fb("A", "C1", undefined), fb("B", "C2", undefined), fb("C", "C3", undefined), fb("D", "C4", undefined)]);
    const [row] = impactRows([{ id: "t1", name: "T", severity: "high", feedbackIds: ["A", "A", "B", "GONE"] }], pop, []);
    expect(row!.count).toBe(2);
    expect(row!.percentage).toBe(50);
  });
});

describe("feedback dates", () => {
  it("never guesses an ambiguous day/month order", () => {
    expect(parseFeedbackDate("03/04/2026", null)).toBeNull();
    expect(parseFeedbackDate("03/04/2026", detectNumericOrder(["25/04/2026"]))).toBe("2026-04-03");
    expect(parseFeedbackDate("2026-10-02", null)).toBe("2026-10-02");
  });
});

const labels = (neg: string[], pos: string[]): AnalysisResult["itemLabels"] =>
  Object.fromEntries([
    ...neg.map((id) => [id, { sentiment: "negative" as const, themeId: null }]),
    ...pos.map((id) => [id, { sentiment: "positive" as const, themeId: null }]),
  ]);

describe("trends and comparisons", () => {
  it("reports insufficient data when there is no history", () => {
    const pop = buildPopulation([fb("A", "C1", "2026-10-02"), fb("B", "C2", undefined)]);
    expect(complaintTrend(pop, {}).ok).toBe(false);
    expect(defaultRanges(pop)).toBeNull();
  });

  it("does not report a % change when a period has fewer than 5 dated items", () => {
    const items = [
      ...["A1", "A2", "A3", "A4", "A5"].map((id) => fb(id, id, "2026-10-01")),
      ...["B1", "B2"].map((id) => fb(id, id, "2026-10-20")),
    ];
    const pop = buildPopulation(items);
    const l = labels(["A1", "B1", "B2"], []);
    const a = periodStats(pop, l, new Map(), { from: "2026-10-01", to: "2026-10-10" });
    const b = periodStats(pop, l, new Map(), { from: "2026-10-11", to: "2026-10-31" });
    expect(compareCounts(a, b, a.complaints, b.complaints)).toEqual({ kind: "insufficient" });
  });

  it("computes % change only from real complaint counts", () => {
    const items = [
      ...["A1", "A2", "A3", "A4", "A5"].map((id) => fb(id, id, "2026-10-01")),
      ...["B1", "B2", "B3", "B4", "B5"].map((id) => fb(id, id, "2026-10-20")),
    ];
    const pop = buildPopulation(items);
    const l = labels(["A1", "A2", "B1", "B2", "B3"], ["A3", "A4", "A5", "B4", "B5"]);
    const a = periodStats(pop, l, new Map(), { from: "2026-10-01", to: "2026-10-10" });
    const b = periodStats(pop, l, new Map(), { from: "2026-10-11", to: "2026-10-31" });
    expect(a.complaints).toBe(2);
    expect(b.complaints).toBe(3);
    expect(compareCounts(a, b, a.complaints, b.complaints)).toEqual({ kind: "pct", value: 50 });
    expect(compareCounts(a, b, 0, 4)).toEqual({ kind: "new" });
  });
});

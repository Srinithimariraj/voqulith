import { describe, expect, it } from "vitest";
import { countCustomers, dedupeFeedback } from "./dedupe";
import type { FeedbackItem } from "./types";

const fb = (id: string, text: string, customer?: string): FeedbackItem => ({
  id,
  text,
  customer,
  source: "Play Store",
  origin: "manual",
  createdAt: "",
});

describe("duplicate feedback", () => {
  it("collapses identical text posted to two channels into one item", () => {
    const r = dedupeFeedback([fb("A", "Zomato platform fee went up AGAIN!", "C1"), fb("B", "@zomato platform fee went up again", "C1")]);
    expect(r.unique.map((u) => u.id)).toEqual(["A"]);
    expect(r.duplicateOf["B"]).toBe("A");
  });

  it("keeps different customers with different wording as separate voices", () => {
    const r = dedupeFeedback([fb("A", "Delivery was late again", "C1"), fb("B", "My order came very late tonight", "C2")]);
    expect(r.unique).toHaveLength(2);
  });

  it("collapses near-identical repeats from the same customer", () => {
    const r = dedupeFeedback([
      fb("A", "The app crashes when I apply a coupon at checkout every time", "C1"),
      fb("B", "The app crashes when I apply a coupon at checkout, every single time", "C1"),
    ]);
    expect(r.unique).toHaveLength(1);
  });

  it("counts one customer once across several feedback items", () => {
    const items = [fb("A", "x one", "C1"), fb("B", "y two", "c1"), fb("C", "z three")];
    const lookup = new Map(items.map((i) => [i.id, i]));
    expect(countCustomers(["A", "B", "C"], lookup)).toBe(2);
  });
});

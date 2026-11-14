import { describe, expect, it } from "vitest";
import { ALL_FEEDBACK, buildAskInput, selectAskProducts, type ChatTurn } from "./ask-chat";
import type { Product } from "./competitor-store";
import { groundAsk, rawAskSchema } from "./ask-contract";

const products: Product[] = ["own", "ds-1"].map((id, i) => ({
  id, name: "Same product name", isOwn: i === 0, hasSample: false, signature: id,
  feedback: [{ id: i === 0 ? "FB-0001" : "C1-0001", text: i === 0 ? "Refund has not arrived" : "Delivery arrived late", customer: "U1", source: "Email", origin: "manual", createdAt: "" }],
}));

describe("Ask dataset selection", () => {
  it("All Feedback includes primary and competitors without creating datasets", () => {
    expect(selectAskProducts(products, ALL_FEEDBACK)).toBe(products);
  });
  it("Primary Product Only excludes competitor records", () => {
    expect(buildAskInput(selectAskProducts(products, "own"), "Primary", [], "Refunds?").products.flatMap((p) => p.records.map((r) => r.feedback_id))).toEqual(["FB-0001"]);
  });
  it("individual competitor scope excludes primary records", () => {
    expect(buildAskInput(selectAskProducts(products, "ds-1"), "Competitor", [], "Delivery?").products.flatMap((p) => p.records.map((r) => r.feedback_id))).toEqual(["C1-0001"]);
  });
  it("keeps identically named datasets distinct for customer attribution", () => {
    expect(buildAskInput(products, "All", [], "Compare?").products.map((p) => p.name)).toEqual(["Same product name (own)", "Same product name (ds-1)"]);
  });
  it("sends previous questions and grounded cited answers for follow-ups", () => {
    const answer = groundAsk(rawAskSchema.parse({ answer: "Refund delay [FB-0001]", status: "answered" }), {
      items: [{ id: "FB-0001", text: "Refund has not arrived", source: "Email", product: "Primary", duplicateCount: 0 }],
      products: [{ name: "Primary", analyzed: 1, unique: 1, records: 1, duplicates_excluded: 0 }], scopeLabel: "Primary", id: "a", model: "m", createdAt: "",
    });
    const turns: ChatTurn[] = [{ id: "a", question: "What is the issue?", answer }];
    const input = buildAskInput(products, "All", turns, "Why is that a problem?");
    expect(input.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(input.messages[1]?.content).toContain("Refund delay [FB-0001]");
    expect(input.messages[2]?.content).toBe("Why is that a problem?");
  });
});
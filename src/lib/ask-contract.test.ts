import { describe, expect, it } from "vitest";
import {
  answerToHistoryText,
  askFeedbackInputSchema,
  findUnverifiedNumbers,
  groundAsk,
  prepareAsk,
  rawAskSchema,
  WITHHELD_MESSAGE,
  type AskItem,
  type Segment,
} from "./ask-contract";
import { locateVerbatim } from "./grounding";

const items: AskItem[] = [
  { id: "FB-0001", text: "Refund took 12 days and support kept saying “escalated”.", source: "Email", customer: "U1", duplicateCount: 0, product: "Zomato" },
  { id: "FB-0002", text: "Refund still pending for a week!!", source: "Play Store", customer: "U1", duplicateCount: 0, product: "Zomato" },
  { id: "FB-0003", text: "Delivery was fast, food was hot.", source: "App Store", duplicateCount: 0, product: "Zomato" },
  { id: "C1-0001", text: "Refunds are instant here, love it", source: "Play Store", customer: "U1", duplicateCount: 0, product: "Swiggy" },
];
const products = [
  { name: "Zomato", records: 3, unique: 3, analyzed: 3, duplicates_excluded: 0 },
  { name: "Swiggy", records: 1, unique: 1, analyzed: 1, duplicates_excluded: 0 },
];
const ctx = { items, products, scopeLabel: "All feedback", id: "a", model: "m", createdAt: "t" };
const ground = (raw: Record<string, unknown>) => groundAsk(rawAskSchema.parse(raw), ctx);
const text = (s: Segment[]) => s.map((x) => (x.t === "text" ? x.v : `<${x.id}>`)).join("");

describe("exact quotes", () => {
  it("returns the customer's own characters for a verbatim excerpt", () => {
    expect(locateVerbatim('support kept saying "escalated"', items[0]!.text)).toBe("support kept saying “escalated”");
  });
  it("rejects a fabricated quote and keeps a real one", () => {
    const r = ground({
      answer: "Refunds are slow [FB-0001].",
      status: "answered",
      quotes: [
        { feedback_id: "FB-0001", quote: "Refund took 12 days" },
        { feedback_id: "FB-0002", quote: "Refunds never ever arrive" },
      ],
    });
    expect(r.quotes.map((q) => q.quote)).toEqual(["Refund took 12 days"]);
    expect(r.verification.quotes_rejected).toBe(1);
  });
  it("rejects a real excerpt attributed to the wrong feedback ID", () => {
    const r = ground({ answer: "x [FB-0003]", status: "answered", quotes: [{ feedback_id: "FB-0003", quote: "Refund still pending" }] });
    expect(r.quotes).toHaveLength(0);
  });
});

describe("feedback IDs", () => {
  it("removes invented IDs from the answer text, findings and quotes", () => {
    const r = ground({
      answer: "Refund delays [FB-0001, FB-9999] and also FB-0500 complained.",
      status: "answered",
      findings: [{ id: "F1", point: "Slow refunds", feedback_ids: ["FB-0001", "FB-0777"] }],
      quotes: [{ feedback_id: "FB-4242", quote: "made up words here" }],
    });
    expect(text(r.answer)).toBe("Refund delays <FB-0001> and also (unverified ID removed) complained.");
    expect(r.findings[0]!.feedback_ids).toEqual(["FB-0001"]);
    expect(r.verification.unknown_ids_removed.sort()).toEqual(["FB-0500", "FB-0777", "FB-4242", "FB-9999"]);
  });
  it("drops findings that have no valid evidence", () => {
    const r = ground({ answer: "a [FB-0003]", status: "answered", findings: [{ id: "F1", point: "Invented", feedback_ids: ["FB-9999"] }] });
    expect(r.findings).toHaveLength(0);
    expect(r.verification.findings_dropped_no_evidence).toBe(1);
  });
  it("withholds an answer that cites no valid feedback", () => {
    const r = ground({ answer: "Customers love the new loyalty program.", status: "answered", findings: [{ id: "F1", point: "x", feedback_ids: ["FB-0999"] }] });
    expect(r.withheld).toBe(true);
    expect(r.status).toBe("insufficient");
    expect(text(r.answer)).toBe(WITHHELD_MESSAGE);
    expect(r.evidence.items).toBe(0);
  });
  it("keeps the model's explanation when it says the evidence is insufficient", () => {
    const r = ground({ answer: "The feedback does not mention pricing.", status: "insufficient" });
    expect(r.withheld).toBe(false);
    expect(text(r.answer)).toBe("The feedback does not mention pricing.");
  });
});

describe("counts are computed by the app", () => {
  it("fills placeholders from the cited feedback, counting a customer once per product", () => {
    const r = ground({
      answer: "{{items:F1}} items from {{customers:F1}} customers ({{share:F1}}) mention refunds.",
      status: "answered",
      findings: [{ id: "F1", point: "Refunds", feedback_ids: ["FB-0001", "FB-0002", "C1-0001"] }],
    });
    expect(text(r.answer)).toBe("3 items from 2 customers (75%) mention refunds.");
    expect(r.findings[0]!.by_product).toEqual([
      { name: "Zomato", items: 2, share: 66.7 },
      { name: "Swiggy", items: 1, share: 100 },
    ]);
  });
  it("counts feedback without a customer ID as unidentified, not as a customer", () => {
    const r = ground({ answer: "a", status: "answered", findings: [{ id: "F1", point: "Fast", feedback_ids: ["FB-0003"] }] });
    expect(r.evidence.customers).toBe(0);
    expect(r.evidence.unidentified).toBe(1);
  });
  it("computes metric placeholders in evidence limitations too", () => {
    const r = ground({ answer: "Refunds [FB-0001]", status: "partial", limitations: ["Only {{total_items}} items were read."] });
    expect(r.limitations).toEqual(["Only 4 items were read."]);
  });
  it("flags numbers the AI wrote itself but not quoted text, IDs or list markers", () => {
    expect(findUnverifiedNumbers('About 40% of users [FB-0001] said "took 12 days"\n1. Refunds')).toEqual(["40%"]);
  });
});

describe("conversation input", () => {
  const rec = { feedback_id: "FB-0001", source: "Email", customer_id: null, feedback_text: "hi there", date: null };
  it("requires the last message to be a question", () => {
    const r = askFeedbackInputSchema.safeParse({
      scope_label: "x",
      products: [{ name: "A", records: [rec] }],
      messages: [{ role: "assistant", content: "hello" }],
    });
    expect(r.success).toBe(false);
  });
  it("rejects the same feedback ID in two datasets", () => {
    const input = askFeedbackInputSchema.parse({
      scope_label: "x",
      products: [
        { name: "A", records: [rec] },
        { name: "B", records: [rec] },
      ],
      messages: [{ role: "user", content: "q" }],
    });
    expect(prepareAsk(input)).toMatchObject({ ok: false, code: "invalid_input" });
  });
  it("keeps only recent turns and starts the context on a question", () => {
    const messages = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` }));
    const input = askFeedbackInputSchema.parse({ scope_label: "x", products: [{ name: "A", records: [rec] }], messages });
    const r = prepareAsk(input);
    expect(r.ok && r.history[0]!.role).toBe("user");
    expect(r.ok && r.history.at(-1)!.content).toBe("m14");
  });
  it("sends earlier answers back with their IDs so follow-ups can refer to them", () => {
    const a = ground({ answer: "Slow refunds [FB-0001].", status: "answered", quotes: [{ feedback_id: "FB-0002", quote: "still pending for a week" }] });
    expect(answerToHistoryText(a)).toContain('[FB-0002] "still pending for a week"');
  });
});

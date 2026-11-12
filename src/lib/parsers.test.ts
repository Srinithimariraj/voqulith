import { describe, expect, it } from "vitest";
import { guessColumns, matchSource, splitTextFeedback } from "./parsers";

describe("spreadsheet column detection", () => {
  it("picks the review text column, not the review ID column", () => {
    const rows = [{ review_id: "1", customer_email: "a@x.com", review_text: "Tracking map froze again", channel: "Zendesk" }];
    const map = guessColumns(Object.keys(rows[0]!), rows);
    expect(map.text).toBe("review_text");
    expect(map.customer).toBe("customer_email");
    expect(map.source).toBe("channel");
  });
});

describe("source mapping", () => {
  it("maps helpdesk tools to Support Ticket", () => {
    expect(matchSource("Zendesk", "Other")).toBe("Support Ticket");
  });
});

describe("text file splitting", () => {
  it("splits on blank lines", () => {
    expect(splitTextFeedback("First one here.\n\nSecond one\ncontinues.")).toEqual(["First one here.", "Second one continues."]);
  });
});

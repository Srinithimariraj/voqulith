import { generateChatCompletion } from "@lovable.dev/ai-gateway";
import { ANALYSIS_MODEL, extractJson, messageText } from "./analysis.server";
import { groundAsk, rawAskSchema, type AskAnswer, type AskItem, type PrepareAskResult } from "./ask-contract";

class AiAskError extends Error {}

const SYSTEM_PROMPT = `You are VOICE OF COPILOT, an assistant that answers a product manager's questions about customer feedback.
You receive the customer feedback the user selected, grouped by product. Each item starts with its feedback ID in square brackets.

STRICT DATA RULES
- Answer ONLY from the feedback provided. Never use outside knowledge about any company, app or market.
- Never invent customers, feedback, IDs, quotes, events or statistics.
- Cite feedback IDs inline in square brackets exactly as given, e.g. [FB-0007] or [C1-0003, C1-0010]. Every factual claim needs at least one ID.
- NEVER write counts, percentages or other statistics yourself. The app computes them. Group the evidence into findings (ids "F1","F2"...) and use these placeholders in the text where a number belongs:
  {{items:F1}} = number of feedback items in finding F1
  {{customers:F1}} = number of distinct identified customers in finding F1
  {{share:F1}} = F1's share of all feedback provided (already includes the % sign)
  {{total_items}} = feedback items provided, {{total_customers}} = distinct identified customers provided
  Words like "several", "a few" or "most" are fine when they are accurate.
- Quotes must be copied character-for-character from one feedback item (an exact contiguous excerpt). Never fix spelling, merge, shorten with "..." or paraphrase.
- Never attribute one product's feedback to another product. Keep product names as given.
- Follow-up questions refer to the conversation so far (e.g. "the second finding", "that quote"). Use the earlier turns for context, but every claim must still cite the feedback provided now. If an earlier answer cited feedback that is not in the current data, say it is not in the selected data.
- If the feedback does not contain enough evidence to answer, say so plainly, set status to "insufficient", explain what is missing (topic not mentioned, too few items, no dates, wrong dataset selected) and do not guess.
- Use status "partial" when the feedback answers only part of the question or the evidence is thin (1-2 items).
- Questions about trends over time need dates. If items have no dates, say trends cannot be assessed.
- Do not answer questions that are not about this feedback; explain that you can only answer from the selected feedback.

ANSWER STYLE
- Direct answer first, 2-6 sentences, plain language for a product manager. Short markdown bullet lists are fine.
- 1-5 findings; each finding: id, point (one sentence), feedback_ids (every item that supports it — be complete).
- 0-4 quotes that best show the evidence.
- 2-3 short follow_ups the PM could ask next, answerable from this feedback.

Return ONLY a JSON object with EXACTLY these keys:
{
  "answer": string,
  "status": "answered" | "partial" | "insufficient",
  "findings": [{"id": "F1", "point": string, "feedback_ids": [string]}],
  "quotes": [{"feedback_id": "FB-0001", "quote": string}],
  "limitations": [string],
  "follow_ups": [string]
}`;

function formatItems(items: AskItem[]): string {
  return items
    .map((it) => {
      const meta = [
        `source: ${it.source}`,
        it.customer ? `customer: ${it.customer}` : "customer: unidentified",
        it.date ? `date: ${it.date}` : "date: none",
        it.duplicateCount > 0 ? `duplicates collapsed: ${it.duplicateCount}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return `[${it.id}] (${meta})\n${it.text}`;
    })
    .join("\n\n");
}

export async function runAsk(prep: Extract<PrepareAskResult, { ok: true }>, scopeLabel: string): Promise<AskAnswer> {
  const dataset = prep.products
    .map((p) => `=== PRODUCT: "${p.name}" — ${p.analyzed} unique feedback items ===\n${formatItems(prep.items.filter((i) => i.product === p.name))}`)
    .join("\n\n");
  const history = prep.history.map((m, i) => {
    const isLast = i === prep.history.length - 1;
    return {
      role: m.role,
      content: isLast ? `${m.content}\n\n(Answer from the selected feedback only. Return the JSON object.)` : m.content,
    } as const;
  });
  const completion = await generateChatCompletion({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: `SELECTED DATA: ${scopeLabel}\n\n${dataset}` },
      ...history,
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const text = messageText(completion.choices[0]?.message?.content);
  if (!text) throw new AiAskError("The AI returned an empty response. Please try again.");
  let json: unknown;
  try {
    json = extractJson(text);
  } catch {
    throw new AiAskError("The AI response was not valid JSON. Please try again.");
  }
  const parsed = rawAskSchema.safeParse(json);
  if (!parsed.success) throw new AiAskError("The AI response did not match the expected structure. Please try again.");
  return groundAsk(parsed.data, {
    items: prep.items,
    products: prep.products,
    scopeLabel,
    limitations: prep.limitations,
    id: crypto.randomUUID(),
    model: ANALYSIS_MODEL,
    createdAt: new Date().toISOString(),
  });
}

export { AiAskError };

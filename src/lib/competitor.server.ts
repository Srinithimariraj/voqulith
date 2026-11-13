import { generateChatCompletion } from "@lovable.dev/ai-gateway";
import { ANALYSIS_MODEL, extractJson, messageText } from "./analysis.server";
import {
  groundComparison,
  rawComparisonSchema,
  type ComparisonItem,
  type ComparisonOutput,
  type PrepareComparisonResult,
} from "./competitor-contract";

class AiComparisonError extends Error {}

const SYSTEM_PROMPT = `You are VOICE OF COPILOT, a competitive customer-feedback analyst for product managers.
You receive customer feedback for TWO products, A and B. Each item is prefixed with its feedback ID in square brackets and its product.

STRICT DATA RULES
- Use ONLY the feedback provided. Never invent customers, numbers, quotes, features or facts about either product.
- Do not use outside knowledge about any company or app. If something is not in the feedback, it does not exist for this analysis.
- Cite exact feedback IDs as given. Never attribute product A feedback to product B or vice versa.
- Do not output counts or percentages; the app computes them.
- The two datasets may differ in size, period and channel. Say so in limitations when it could bias the comparison.

TASKS
1. themes: ONE shared, product-neutral theme taxonomy (4-10 themes, ids "T1","T2"...) that can describe feedback from BOTH products, e.g. "Delivery delays", "Refund handling". name, description, severity (critical|high|medium|low) of the problem.
2. item_labels: for EVERY feedback ID: sentiment (positive|neutral|negative|mixed) and the theme_id it best fits (or null).
3. feature_requests: explicit requests or wishes for a capability (ids "F1"...). Group the same request across both products. title, description, feedback_ids (only items that actually ask for it).
4. opportunities: 3-6 customer experience opportunities (ids "O1"...) grounded in contrasts between A and B, e.g. a pain frequent for one product and praised or absent for the other. title, description (mark it as an assessment), for_product ("A", "B" or "both" = who should act), next_step, evidence_ids from the feedback that shows the contrast.
5. summary: 3-4 sentences comparing the two products for a PM. Refer to them as product A and product B.
6. limitations: list of caveats about comparability and evidence.

Return ONLY a JSON object with EXACTLY these keys:
{
  "summary": string,
  "themes": [{"id": "T1", "name": string, "description": string, "severity": "high"}],
  "item_labels": [{"id": "FB-0001", "sentiment": "negative", "theme_id": "T1"}],
  "feature_requests": [{"id": "F1", "title": string, "description": string, "feedback_ids": [string]}],
  "opportunities": [{"id": "O1", "title": string, "description": string, "for_product": "A", "next_step": string, "evidence_ids": [string]}],
  "limitations": [string]
}`;

function formatItems(items: ComparisonItem[]): string {
  return items
    .map((it) => {
      const meta = [
        `product: ${it.product}`,
        `source: ${it.source}`,
        it.date ? `date: ${it.date}` : null,
        it.duplicateCount > 0 ? `duplicates collapsed: ${it.duplicateCount}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return `[${it.id}] (${meta})\n${it.text}`;
    })
    .join("\n\n");
}

export async function runComparison(prep: Extract<PrepareComparisonResult, { ok: true }>): Promise<ComparisonOutput> {
  const a = prep.items.filter((i) => i.product === "A");
  const b = prep.items.filter((i) => i.product === "B");
  const completion = await generateChatCompletion({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `PRODUCT A — "${prep.sides.A.name}": ${a.length} unique feedback items.\nPRODUCT B — "${prep.sides.B.name}": ${b.length} unique feedback items.\n\n=== PRODUCT A ===\n${formatItems(a)}\n\n=== PRODUCT B ===\n${formatItems(b)}\n\nReturn the JSON object now.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });
  const text = messageText(completion.choices[0]?.message?.content);
  if (!text) throw new AiComparisonError("The AI returned an empty response. Please try again.");
  const parsed = rawComparisonSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new AiComparisonError("The AI response did not match the expected structure. Please try again.");
  return groundComparison(parsed.data, {
    sides: prep.sides,
    id: crypto.randomUUID(),
    model: ANALYSIS_MODEL,
    createdAt: new Date().toISOString(),
  });
}

export { AiComparisonError };

import {
  GatewayError,
  PaymentRequiredError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  generateChatCompletion,
} from "@lovable.dev/ai-gateway";
import { rawAnalysisSchema } from "./analysis-schema";
import { groundAnalysis } from "./grounding";
import type { AnalysisInputItem, AnalysisResult, ExtractedFeedback } from "./types";

export const ANALYSIS_MODEL = "google/gemini-3.8-flash" as const;

const SYSTEM_PROMPT = `You are VOICE OF COPILOT, a customer-feedback intelligence analyst for product managers.
You receive customer feedback items, each prefixed with its feedback ID in square brackets.

STRICT DATA RULES
- Use ONLY the feedback provided. Never invent customers, numbers, quotes or events.
- Every insight must cite the feedback IDs that support it (exact IDs as given, e.g. "FB-0007").
- Quotes and churn evidence MUST be copied character-for-character from the feedback text (an exact contiguous excerpt). Do not fix spelling, translate, or paraphrase.
- Items marked "duplicates collapsed: N" are one customer voice, already de-duplicated; do not count them more than once.
- Label assumptions and uncertainty explicitly. If evidence is thin (1-2 items), lower confidence and say so.
- Do not estimate revenue figures. Describe business impact qualitatively and mark it as an assessment.
- If the dataset is small or skewed toward one source, list that as a limitation.

TASKS
1. item_labels: for EVERY feedback ID give sentiment (positive|neutral|negative|mixed) and the theme_id it best belongs to (or null).
2. themes: cluster feedback into 3-10 themes. Each theme: id ("T1","T2"...), name, description, overall sentiment, severity (critical|high|medium|low), feedback_ids, confidence 0-1.
3. pain_points: specific problems (id "P1"...), title, description, severity, theme_id, feedback_ids.
4. quotes: 1-3 most representative verbatim quotes per theme: feedback_id, quote (exact excerpt), theme_id, sentiment.
5. churn_signals: only where the text shows it. signal_type one of cancellation_intent | uninstall_intent | repeated_unresolved_complaint | refund_frustration | competitor_switch. evidence = exact excerpt, risk_level high|medium|low, rationale, confidence 0-1.
6. recommendations: 3-8 roadmap items (id "R1"...): title, problem, evidence_ids, business_impact, priority (P0 = urgent, revenue/retention risk or broken core flow; P1 = important; P2 = improvement), next_action (concrete first step for the PM), confidence 0-1, assumptions (list).
7. executive_summary: summary (3-5 sentences for a PM leader), key_findings (finding + evidence_ids), confidence 0-1, assumptions, limitations.

Return ONLY a JSON object with keys: executive_summary, item_labels, themes, pain_points, quotes, churn_signals, recommendations.`;

function formatItems(items: AnalysisInputItem[]): string {
  return items
    .map((it) => {
      const meta = [
        `source: ${it.source}`,
        it.customer ? `customer: ${it.customer}` : "customer: unidentified",
        it.rating != null ? `rating: ${it.rating}` : null,
        it.date ? `date: ${it.date}` : null,
        it.duplicateCount > 0 ? `duplicates collapsed: ${it.duplicateCount}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return `[${it.id}] (${meta})\n${it.text}`;
    })
    .join("\n\n");
}

function extractJson(content: string): unknown {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("The AI response was not valid JSON.");
  }
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === "object" && "text" in p ? String((p as { text: unknown }).text) : ""))
      .join("");
  }
  return "";
}

export function friendlyAiError(err: unknown): string {
  if (err instanceof PaymentRequiredError)
    return "AI credits are used up for this workspace. Add credits, then try again.";
  if (err instanceof RateLimitError)
    return "The AI service is busy right now. Please wait a minute and try again.";
  if (err instanceof TimeoutError || err instanceof NetworkError)
    return "The AI request timed out or lost connection. Please try again.";
  if (err instanceof GatewayError) return `The AI service returned an error (${err.code}).`;
  if (err instanceof Error) return err.message;
  return "Unexpected error while running the analysis.";
}

export async function runAnalysis(args: {
  items: AnalysisInputItem[];
  totalFeedbackItems: number;
  datasetSignature: string;
}): Promise<AnalysisResult> {
  const completion = await generateChatCompletion({
    model: ANALYSIS_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Dataset: ${args.items.length} unique feedback items (${args.totalFeedbackItems} before de-duplication).\n\n${formatItems(args.items)}\n\nReturn the JSON object now.`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
  });

  const text = messageText(completion.choices[0]?.message?.content);
  if (!text) throw new Error("The AI returned an empty response. Please try again.");
  const parsed = rawAnalysisSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new Error("The AI response did not match the expected structure.");

  return groundAnalysis(parsed.data, {
    items: args.items,
    totalFeedbackItems: args.totalFeedbackItems,
    model: ANALYSIS_MODEL,
    datasetSignature: args.datasetSignature,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  });
}


export async function runScreenshotExtraction(imageDataUrl: string): Promise<{
  items: ExtractedFeedback[];
  notes: string;
}> {
  const completion = await generateChatCompletion({
    model: ANALYSIS_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You transcribe customer feedback from screenshots (app store reviews, chats, tweets, emails, support tickets). Copy text EXACTLY as written, preserving spelling and wording. Do not summarise, translate, or invent. Split separate reviews/messages into separate items. Ignore UI chrome, buttons and agent/brand replies. If nothing legible, return an empty list. Return JSON: {\"items\":[{\"text\":string,\"customer\":string|null,\"date\":string|null,\"rating\":number|null}],\"notes\":string}",
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Transcribe every customer feedback message in this screenshot. Return JSON only." },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  const text = messageText(completion.choices[0]?.message?.content);
  const data = extractJson(text || "{}") as { items?: unknown; notes?: unknown };
  const items: ExtractedFeedback[] = Array.isArray(data.items)
    ? data.items
        .map((raw) => {
          const r = (raw ?? {}) as Record<string, unknown>;
          const rating = Number(r["rating"]);
          return {
            text: typeof r["text"] === "string" ? r["text"].trim() : "",
            customer: typeof r["customer"] === "string" && r["customer"] ? r["customer"] : null,
            date: typeof r["date"] === "string" && r["date"] ? r["date"] : null,
            rating: Number.isFinite(rating) && rating > 0 ? rating : null,
          };
        })
        .filter((i) => i.text.length > 2)
    : [];
  return { items, notes: typeof data.notes === "string" ? data.notes : "" };
}

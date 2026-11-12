import { createServerFn } from "@tanstack/react-start";
import {
  analyzeFeedbackInputSchema,
  prepareRecords,
  toApiResponse,
  type AnalyzeFeedbackResponse,
} from "./analysis-contract";

/**
 * analyze-feedback — secure backend function.
 * Input:  { records: [{ feedback_id, source, customer_id, feedback_text, date }] }
 * Output: AnalyzeFeedbackResponse (structured, evidence-linked JSON) or a typed error.
 * Runs only on the server; the Gemini call goes through the Lovable AI Gateway with a server-side key.
 */
export const analyzeFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<AnalyzeFeedbackResponse> => {
    const parsed = analyzeFeedbackInputSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      return {
        ok: false,
        error: { code: "invalid_input", message: `${issue?.message ?? "Invalid input"}${where}` },
      };
    }

    const prepared = prepareRecords(parsed.data.records);
    if (!prepared.ok) return { ok: false, error: { code: prepared.code, message: prepared.message } };

    const { runAnalysis, classifyAiError } = await import("./analysis.server");
    try {
      const result = await runAnalysis({ items: prepared.items, totalFeedbackItems: prepared.totalRecords });
      return {
        ok: true,
        data: toApiResponse(result, {
          recordsById: prepared.recordsById,
          duplicateGroups: prepared.duplicateGroups,
          limitations: prepared.limitations,
        }),
      };
    } catch (err) {
      console.error("analyze-feedback failed", err);
      return { ok: false, error: classifyAiError(err) };
    }
  });

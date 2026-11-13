import { createServerFn } from "@tanstack/react-start";
import { compareProductsInputSchema, prepareComparison, type CompareProductsResponse } from "./competitor-contract";

/**
 * compare-products — secure backend function.
 * Input:  { products: [{ name, records: [{ feedback_id, source, customer_id, feedback_text, date }] } x2] }
 * Output: shared themes, per-record labels, feature requests and CX opportunities, all tied to feedback IDs.
 */
export const compareProducts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<CompareProductsResponse> => {
    const parsed = compareProductsInputSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      return { ok: false, error: { code: "invalid_input", message: `${issue?.message ?? "Invalid input"}${where}` } };
    }
    const prep = prepareComparison(parsed.data);
    if (!prep.ok) return { ok: false, error: { code: prep.code, message: prep.message } };

    const { runComparison, AiComparisonError } = await import("./competitor.server");
    const { classifyAiError } = await import("./analysis.server");
    try {
      return { ok: true, data: await runComparison(prep) };
    } catch (err) {
      console.error("compare-products failed", err);
      if (err instanceof AiComparisonError) return { ok: false, error: { code: "ai_invalid_response", message: err.message } };
      return { ok: false, error: classifyAiError(err) };
    }
  });

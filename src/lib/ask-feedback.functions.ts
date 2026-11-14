import { createServerFn } from "@tanstack/react-start";
import { askFeedbackInputSchema, prepareAsk, type AskFeedbackResponse } from "./ask-contract";

/**
 * ask-feedback — secure backend function for Ask Your Feedback.
 * Input:  { scope_label, products: [{ name, records: [{ feedback_id, source, customer_id, feedback_text, date }] }], messages }
 * Output: a grounded answer — valid feedback IDs only, verbatim quotes, app-computed counts.
 * Runs only on the server; the Gemini call uses the Lovable AI Gateway with a server-side key.
 */
export const askFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<AskFeedbackResponse> => {
    const parsed = askFeedbackInputSchema.safeParse(data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
      return { ok: false, error: { code: "invalid_input", message: `${issue?.message ?? "Invalid input"}${where}` } };
    }
    const prep = prepareAsk(parsed.data);
    if (!prep.ok) return { ok: false, error: { code: prep.code, message: prep.message } };

    const { runAsk, AiAskError } = await import("./ask.server");
    const { classifyAiError } = await import("./analysis.server");
    try {
      return { ok: true, data: await runAsk(prep, parsed.data.scope_label) };
    } catch (err) {
      console.error("ask-feedback failed", err);
      if (err instanceof AiAskError) return { ok: false, error: { code: "ai_invalid_response", message: err.message } };
      return { ok: false, error: classifyAiError(err) };
    }
  });

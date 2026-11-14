import { answerToHistoryText, MAX_HISTORY_MESSAGES, type AskAnswer, type AskFeedbackInput } from "./ask-contract";
import type { Product } from "./competitor-store";

export type ChatTurn = { id: string; question: string; answer: AskAnswer };
export const ALL_FEEDBACK = "all";

/** Scope reads the existing product stores; it never creates or copies a dataset. */
export function selectAskProducts(products: Product[], scope: string): Product[] {
  return scope === ALL_FEEDBACK ? products : products.filter((p) => p.id === scope);
}

export function buildAskInput(products: Product[], label: string, turns: ChatTurn[], question: string): AskFeedbackInput {
  const messages: AskFeedbackInput["messages"] = turns.slice(-5).flatMap((t) => [
    { role: "user" as const, content: t.question },
    { role: "assistant" as const, content: answerToHistoryText(t.answer) },
  ]);
  messages.push({ role: "user", content: question.trim() });
  return {
    scope_label: label,
    products: products.map((p) => ({
      // Keep identically named products distinct in customer counts and evidence attribution.
      name: `${p.name.slice(0, 60)} (${p.id})`,
      records: p.feedback.map((f) => ({ feedback_id: f.id, source: f.source, customer_id: f.customer ?? null, feedback_text: f.text, date: f.date ?? null })),
    })),
    messages: messages.slice(-MAX_HISTORY_MESSAGES),
  };
}
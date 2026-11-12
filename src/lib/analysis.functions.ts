import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { AnalysisResult } from "./types";
import type { ExtractedFeedback } from "./analysis.server";

const itemSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(4000),
  source: z.string().max(60),
  customer: z.string().max(120).optional(),
  rating: z.number().min(0).max(10).optional(),
  date: z.string().max(40).optional(),
  duplicateCount: z.number().int().min(0).max(1000),
});

const analyzeInput = z.object({
  items: z.array(itemSchema).min(1).max(600),
  totalFeedbackItems: z.number().int().min(1).max(100000),
  datasetSignature: z.string().max(80),
});

export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; error: string };

export const analyzeFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => analyzeInput.parse(input))
  .handler(async ({ data }): Promise<AnalyzeResponse> => {
    const { runAnalysis, friendlyAiError } = await import("./analysis.server");
    try {
      const items = data.items.map((i) => ({
        ...i,
        customer: i.customer,
        rating: i.rating,
        date: i.date,
      }));
      const result = await runAnalysis({
        items,
        totalFeedbackItems: data.totalFeedbackItems,
        datasetSignature: data.datasetSignature,
      });
      return { ok: true, result };
    } catch (err) {
      console.error("analyzeFeedback failed", err);
      return { ok: false, error: friendlyAiError(err) };
    }
  });

const screenshotInput = z.object({
  imageDataUrl: z
    .string()
    .max(8_000_000)
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,/, "Unsupported image format"),
});

export type ScreenshotResponse =
  | { ok: true; items: ExtractedFeedback[]; notes: string }
  | { ok: false; error: string };

export const extractScreenshotFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => screenshotInput.parse(input))
  .handler(async ({ data }): Promise<ScreenshotResponse> => {
    const { runScreenshotExtraction, friendlyAiError } = await import("./analysis.server");
    try {
      const out = await runScreenshotExtraction(data.imageDataUrl);
      return { ok: true, ...out };
    } catch (err) {
      console.error("extractScreenshotFeedback failed", err);
      return { ok: false, error: friendlyAiError(err) };
    }
  });

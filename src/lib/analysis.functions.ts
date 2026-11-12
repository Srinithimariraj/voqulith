import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExtractedFeedback } from "./types";

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

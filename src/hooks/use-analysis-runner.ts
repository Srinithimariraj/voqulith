import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { toast } from "sonner";
import { analyzeFeedback } from "@/lib/analysis.functions";
import { getRun, setRun, useRunState } from "@/lib/run-store";
import { setAnalysis, useDataset } from "@/lib/store";

export const MAX_ANALYSIS_ITEMS = 600;

export function useAnalysisRunner() {
  const analyze = useServerFn(analyzeFeedback);
  const runState = useRunState();
  const { dedupe, feedback, signature } = useDataset();

  const run = useCallback(async () => {
    if (getRun().status === "running") return;
    if (dedupe.unique.length === 0) {
      toast.error("Add some feedback first.");
      return;
    }
    const items = dedupe.unique.slice(0, MAX_ANALYSIS_ITEMS).map((f) => ({
      id: f.id,
      text: f.text.slice(0, 4000),
      source: f.source,
      ...(f.customer ? { customer: f.customer.slice(0, 120) } : {}),
      ...(f.rating != null ? { rating: f.rating } : {}),
      ...(f.date ? { date: f.date.slice(0, 40) } : {}),
      duplicateCount: dedupe.copies[f.id] ?? 0,
    }));
    setRun({ status: "running", error: null, startedAt: Date.now() });
    try {
      const res = await analyze({
        data: { items, totalFeedbackItems: feedback.length, datasetSignature: signature },
      });
      if (!res.ok) {
        setRun({ status: "error", error: res.error, startedAt: null });
        toast.error("Analysis failed", { description: res.error });
        return;
      }
      setAnalysis(res.result);
      setRun({ status: "success", error: null, startedAt: null });
      toast.success("Analysis complete", {
        description: `${res.result.themes.length} themes · ${res.result.churnSignals.length} churn signals`,
      });
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : "Could not reach the analysis service.";
      setRun({ status: "error", error: message, startedAt: null });
      toast.error("Analysis failed", { description: message });
    }
  }, [analyze, dedupe, feedback.length, signature]);

  return { ...runState, run, uniqueCount: dedupe.unique.length };
}

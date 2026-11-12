import { useServerFn } from "@tanstack/react-start";
import { useCallback } from "react";
import { toast } from "sonner";
import { fromApiResponse, MAX_UNIQUE_ANALYZED, type FeedbackRecord } from "@/lib/analysis-contract";
import { analyzeFeedback } from "@/lib/analyze-feedback.functions";
import { getRun, setRun, useRunState } from "@/lib/run-store";
import { setAnalysis, useDataset } from "@/lib/store";

export const MAX_ANALYSIS_ITEMS = MAX_UNIQUE_ANALYZED;

export function useAnalysisRunner() {
  const analyze = useServerFn(analyzeFeedback);
  const runState = useRunState();
  const { dedupe, feedback, signature } = useDataset();

  const run = useCallback(async () => {
    if (getRun().status === "running") return;
    if (feedback.length === 0) {
      toast.error("Add some feedback first.");
      return;
    }
    // Send every record; the backend collapses duplicates so they're never counted twice.
    const records: FeedbackRecord[] = feedback.map((f) => ({
      feedback_id: f.id,
      source: f.source,
      customer_id: f.customer ?? null,
      feedback_text: f.text,
      date: f.date ?? null,
    }));
    setRun({ status: "running", error: null, startedAt: Date.now() });
    try {
      const res = await analyze({ data: { records } });
      if (!res.ok) {
        setRun({ status: "error", error: res.error.message, startedAt: null });
        toast.error("Analysis failed", { description: res.error.message });
        return;
      }
      const result = fromApiResponse(res.data, signature);
      setAnalysis(result);
      setRun({ status: "success", error: null, startedAt: null });
      toast.success("Analysis complete", {
        description: `${result.themes.length} themes · ${result.churnSignals.length} churn signals`,
      });
    } catch (err) {
      console.error("analyze-feedback request failed", err);
      const message = "Couldn't reach the analysis service. Check your connection and try again.";
      setRun({ status: "error", error: message, startedAt: null });
      toast.error("Analysis failed", { description: message });
    }
  }, [analyze, feedback, signature]);

  return { ...runState, run, uniqueCount: dedupe.unique.length };
}

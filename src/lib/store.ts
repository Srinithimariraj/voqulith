import { useMemo, useSyncExternalStore } from "react";
import { dedupeFeedback, datasetSignature } from "./dedupe";
import { buildSampleFeedback } from "./sample-data";
import type { AnalysisResult, FeedbackItem, NewFeedback } from "./types";

interface WorkspaceState {
  feedback: FeedbackItem[];
  analysis: AnalysisResult | null;
  nextSeq: number;
}

const STORAGE_KEY = "voice-of-copilot:workspace:v1";
const EMPTY: WorkspaceState = { feedback: [], analysis: null, nextSeq: 1 };

let state: WorkspaceState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (Array.isArray(parsed.feedback)) state = { ...EMPTY, ...parsed };
    }
  } catch {
    state = EMPTY;
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — keep in memory
  }
}

function setState(next: WorkspaceState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  load();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useWorkspace(): WorkspaceState {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return state;
    },
    () => EMPTY,
  );
}

const pad = (n: number) => `FB-${String(n).padStart(4, "0")}`;

export function addFeedback(items: NewFeedback[]): number {
  load();
  const now = new Date().toISOString();
  let seq = state.nextSeq;
  const created: FeedbackItem[] = items
    .filter((i) => i.text.trim().length > 0)
    .map((i) => ({ ...i, text: i.text.trim(), id: pad(seq++), createdAt: now }));
  setState({ ...state, feedback: [...state.feedback, ...created], nextSeq: seq });
  return created.length;
}

export function removeFeedback(id: string) {
  load();
  setState({ ...state, feedback: state.feedback.filter((f) => f.id !== id) });
}

export function clearFeedback() {
  setState({ ...EMPTY });
}

export function loadSampleData(): number {
  load();
  const withoutSample = state.feedback.filter((f) => f.origin !== "sample");
  state = { ...state, feedback: withoutSample };
  return addFeedback(buildSampleFeedback());
}

export function removeSampleData() {
  load();
  setState({ ...state, feedback: state.feedback.filter((f) => f.origin !== "sample") });
}

export function setAnalysis(analysis: AnalysisResult | null) {
  load();
  setState({ ...state, analysis });
}

/** Derived dataset info shared by every page. */
export function useDataset() {
  const ws = useWorkspace();
  return useMemo(() => {
    const dedupe = dedupeFeedback(ws.feedback);
    const signature = datasetSignature(ws.feedback);
    const byId = new Map(ws.feedback.map((f) => [f.id, f]));
    const hasSample = ws.feedback.some((f) => f.origin === "sample");
    const stale = !!ws.analysis && ws.analysis.datasetSignature !== signature;
    return { ...ws, dedupe, signature, byId, hasSample, stale };
  }, [ws]);
}

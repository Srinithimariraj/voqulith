import { useMemo, useSyncExternalStore } from "react";
import { datasetSignature } from "./dedupe";
import { useDataset } from "./store";
import type { ComparisonOutput } from "./competitor-contract";
import type { DateRange } from "./impact";
import type { FeedbackItem, NewFeedback } from "./types";

/**
 * Competitor datasets and the latest comparison, kept in browser storage separately
 * from the main workspace so competitor feedback never mixes into your own analysis.
 */
export interface ProductDataset {
  id: string;
  name: string;
  /** Feedback IDs are prefixed per dataset (e.g. C1-0004) so they never clash with FB- IDs. */
  prefix: string;
  nextSeq: number;
  feedback: FeedbackItem[];
  createdAt: string;
}

export interface StoredComparison {
  output: ComparisonOutput;
  selection: {
    a: string;
    b: string;
    sharedPeriodOnly: boolean;
    window: DateRange | null;
    signatures: { A: string; B: string };
  };
}

interface CompetitorState {
  ownName: string;
  datasets: ProductDataset[];
  nextDataset: number;
  comparison: StoredComparison | null;
}

export const OWN_PRODUCT_ID = "own";
const STORAGE_KEY = "voice-of-copilot:competitors:v1";
const EMPTY: CompetitorState = { ownName: "Your product", datasets: [], nextDataset: 1, comparison: null };

let state: CompetitorState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CompetitorState;
      if (Array.isArray(parsed.datasets)) state = { ...EMPTY, ...parsed };
    }
  } catch {
    state = EMPTY;
  }
}

function setState(next: CompetitorState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — keep in memory
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useCompetitorState(): CompetitorState {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return state;
    },
    () => EMPTY,
  );
}

export function createDataset(name: string): string {
  load();
  const n = state.nextDataset;
  const ds: ProductDataset = {
    id: `ds-${n}`,
    name: name.trim() || `Competitor ${n}`,
    prefix: `C${n}`,
    nextSeq: 1,
    feedback: [],
    createdAt: new Date().toISOString(),
  };
  setState({ ...state, datasets: [...state.datasets, ds], nextDataset: n + 1 });
  return ds.id;
}

export function addCompetitorFeedback(datasetId: string, items: NewFeedback[]): number {
  load();
  const now = new Date().toISOString();
  let added = 0;
  const datasets = state.datasets.map((d) => {
    if (d.id !== datasetId) return d;
    let seq = d.nextSeq;
    const created = items
      .filter((i) => i.text.trim().length > 0)
      .map((i) => ({ ...i, text: i.text.trim(), id: `${d.prefix}-${String(seq++).padStart(4, "0")}`, createdAt: now }));
    added = created.length;
    return { ...d, feedback: [...d.feedback, ...created], nextSeq: seq };
  });
  setState({ ...state, datasets });
  return added;
}

export function renameDataset(datasetId: string, name: string) {
  load();
  if (!name.trim()) return;
  setState({ ...state, datasets: state.datasets.map((d) => (d.id === datasetId ? { ...d, name: name.trim() } : d)) });
}

export function setOwnProductName(name: string) {
  load();
  setState({ ...state, ownName: name.trim() || "Your product" });
}

export function deleteDataset(datasetId: string) {
  load();
  const c = state.comparison;
  const usesIt = c && (c.selection.a === datasetId || c.selection.b === datasetId);
  setState({ ...state, datasets: state.datasets.filter((d) => d.id !== datasetId), comparison: usesIt ? null : c });
}

export function setComparison(comparison: StoredComparison | null) {
  load();
  setState({ ...state, comparison });
}

export interface Product {
  id: string;
  name: string;
  isOwn: boolean;
  feedback: FeedbackItem[];
  hasSample: boolean;
  signature: string;
}

/** Every product available for comparison: your main workspace plus each competitor dataset. */
export function useProducts() {
  const own = useDataset();
  const cs = useCompetitorState();
  return useMemo(() => {
    const products: Product[] = [
      {
        id: OWN_PRODUCT_ID,
        name: cs.ownName,
        isOwn: true,
        feedback: own.feedback,
        hasSample: own.hasSample,
        signature: own.signature,
      },
      ...cs.datasets.map((d) => ({
        id: d.id,
        name: d.name,
        isOwn: false,
        feedback: d.feedback,
        hasSample: d.feedback.some((f) => f.origin === "sample"),
        signature: datasetSignature(d.feedback),
      })),
    ];
    const byId = new Map<string, FeedbackItem>();
    for (const p of products) for (const f of p.feedback) byId.set(f.id, f);
    return { products, byId, state: cs };
  }, [own, cs]);
}

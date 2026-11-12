import { useSyncExternalStore } from "react";

export interface RunState {
  status: "idle" | "running" | "error" | "success";
  error: string | null;
  startedAt: number | null;
}

const IDLE: RunState = { status: "idle", error: null, startedAt: null };
let run: RunState = IDLE;
const listeners = new Set<() => void>();

export function setRun(next: RunState) {
  run = next;
  listeners.forEach((l) => l());
}
export function getRun() {
  return run;
}
export function useRunState(): RunState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => run,
    () => IDLE,
  );
}

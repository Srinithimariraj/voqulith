export const SOURCES = [
  "Play Store",
  "App Store",
  "Support Ticket",
  "Survey / NPS",
  "Social Media",
  "Email",
  "Customer Interview",
  "Other",
] as const;
export type Source = (typeof SOURCES)[number];

export type Origin = "sample" | "csv" | "excel" | "text" | "screenshot" | "manual";

export interface FeedbackItem {
  id: string;
  text: string;
  source: Source;
  customer?: string | undefined;
  date?: string | undefined;
  rating?: number | undefined;
  origin: Origin;
  fileName?: string | undefined;
  createdAt: string;
}

export type NewFeedback = Omit<FeedbackItem, "id" | "createdAt">;

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type Severity = "critical" | "high" | "medium" | "low";
export type RiskLevel = "high" | "medium" | "low";
export type Priority = "P0" | "P1" | "P2";
export type ChurnType =
  | "cancellation_intent"
  | "uninstall_intent"
  | "repeated_unresolved_complaint"
  | "refund_frustration"
  | "competitor_switch";

export const CHURN_TYPE_LABEL: Record<ChurnType, string> = {
  cancellation_intent: "Cancellation intent",
  uninstall_intent: "Uninstall intent",
  repeated_unresolved_complaint: "Repeated unresolved complaint",
  refund_frustration: "Refund frustration",
  competitor_switch: "Switching to competitor",
};

/** Item sent to the AI: one per unique (de-duplicated) feedback. */
export interface AnalysisInputItem {
  id: string;
  text: string;
  source: string;
  customer?: string | undefined;
  rating?: number | undefined;
  date?: string | undefined;
  duplicateCount: number;
}

export interface Quote {
  feedbackId: string;
  quote: string;
  themeId: string | null;
  sentiment: Sentiment;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  sentiment: Sentiment;
  severity: Severity;
  feedbackIds: string[];
  count: number;
  percentage: number;
  customers: number;
  confidence: number;
}

export interface PainPoint {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  themeId: string | null;
  feedbackIds: string[];
  frequency: number;
  customers: number;
}

export interface ChurnSignal {
  feedbackId: string;
  type: ChurnType;
  evidence: string;
  risk: RiskLevel;
  rationale: string;
  confidence: number;
  customer: string | null;
}

export interface Recommendation {
  id: string;
  title: string;
  problem: string;
  evidenceIds: string[];
  affectedCustomers: number;
  feedbackCount: number;
  businessImpact: string;
  priority: Priority;
  nextAction: string;
  confidence: number;
  assumptions: string[];
}

export interface KeyFinding {
  text: string;
  evidenceIds: string[];
}

export interface Verification {
  quotesProposed: number;
  quotesRejected: number;
  churnProposed: number;
  churnRejected: number;
  unknownIdsRemoved: number;
  insightsDroppedNoEvidence: number;
  unlabeledItems: number;
}

export interface AnalysisResult {
  id: string;
  createdAt: string;
  model: string;
  datasetSignature: string;
  totals: {
    feedbackItems: number;
    uniqueFeedback: number;
    duplicatesExcluded: number;
    customers: number;
    customersIdentified: number;
  };
  executiveSummary: {
    summary: string;
    keyFindings: KeyFinding[];
    confidence: number;
    assumptions: string[];
    limitations: string[];
  };
  sentiment: Record<Sentiment, number> & { unlabeled: number };
  itemLabels: Record<string, { sentiment: Sentiment; themeId: string | null }>;
  themes: Theme[];
  painPoints: PainPoint[];
  quotes: Quote[];
  churnSignals: ChurnSignal[];
  recommendations: Recommendation[];
  verification: Verification;
}

export interface ExtractedFeedback {
  text: string;
  customer: string | null;
  date: string | null;
  rating: number | null;
}

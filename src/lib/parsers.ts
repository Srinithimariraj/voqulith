import { SOURCES, type Source } from "./types";

export interface SheetData {
  columns: string[];
  rows: Record<string, string>[];
}

export async function parseSpreadsheet(file: File): Promise<SheetData> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The file has no sheets.");
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read the first sheet.");
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (json.length === 0) throw new Error("No rows found. Make sure the first row contains column headers.");
  const columns = Array.from(new Set(json.flatMap((r) => Object.keys(r)))).filter(
    (c) => !c.startsWith("__EMPTY"),
  );
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const c of columns) out[c] = String(r[c] ?? "").trim();
    return out;
  });
  return { columns, rows };
}

const GUESS: Record<"text" | "customer" | "date" | "rating" | "source", RegExp> = {
  text: /^(feedback|review|comment|comments|text|message|body|content|description|verbatim|response|complaint)/i,
  customer: /(customer|user|client|email|name|author|account|reviewer)/i,
  date: /(date|time|created|submitted)/i,
  rating: /(rating|score|stars|nps|csat)/i,
  source: /(source|channel|platform|origin)/i,
};

export type ColumnMap = Record<"text" | "customer" | "date" | "rating" | "source", string | null>;

export function guessColumns(columns: string[], rows: Record<string, string>[]): ColumnMap {
  const pick = (re: RegExp, exclude: (string | null)[] = []) =>
    columns.find((c) => re.test(c.trim()) && !exclude.includes(c)) ?? null;
  let text = pick(GUESS.text);
  if (!text) {
    // fall back to the column with the longest average content
    let best: string | null = null;
    let bestLen = 0;
    for (const c of columns) {
      const avg = rows.slice(0, 50).reduce((s, r) => s + (r[c]?.length ?? 0), 0) / Math.min(rows.length, 50);
      if (avg > bestLen) {
        bestLen = avg;
        best = c;
      }
    }
    text = best;
  }
  return {
    text,
    customer: pick(GUESS.customer, [text]),
    date: pick(GUESS.date, [text]),
    rating: pick(GUESS.rating, [text]),
    source: pick(GUESS.source, [text]),
  };
}

export function matchSource(value: string | undefined, fallback: Source): Source {
  if (!value) return fallback;
  const v = value.toLowerCase();
  if (/play|android|google/.test(v)) return "Play Store";
  if (/app ?store|ios|apple/.test(v)) return "App Store";
  if (/ticket|support|zendesk|freshdesk|intercom|chat/.test(v)) return "Support Ticket";
  if (/survey|nps|csat|typeform/.test(v)) return "Survey / NPS";
  if (/twitter|x\.com|social|instagram|facebook|reddit|linkedin/.test(v)) return "Social Media";
  if (/mail/.test(v)) return "Email";
  if (/interview|call/.test(v)) return "Customer Interview";
  const exact = SOURCES.find((s) => s.toLowerCase() === v);
  return exact ?? fallback;
}

/** Split a plain-text file into feedback entries: blank-line separated blocks, else one per line. */
export function splitTextFeedback(content: string): string[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return [];
  const blocks = normalized.split(/\n\s*\n+/).map((b) => b.replace(/\s*\n\s*/g, " ").trim());
  const entries = blocks.length > 1 ? blocks : normalized.split("\n").map((l) => l.trim());
  return entries
    .map((e) => e.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((e) => e.length >= 3);
}

/** Downscale an image to keep the upload small; returns a JPEG data URL. */
export async function imageToDataUrl(file: File, maxSide = 1800): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read this image."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing is not supported in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function fileKind(file: File): "sheet" | "text" | "image" | "unsupported" {
  const name = file.name.toLowerCase();
  if (/\.(csv|tsv|xlsx|xls|ods)$/.test(name)) return "sheet";
  if (/\.(txt|md|text|log)$/.test(name) || file.type.startsWith("text/plain")) return "text";
  if (file.type.startsWith("image/")) return "image";
  return "unsupported";
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  FileSpreadsheet,
  FileText,
  FlaskConical,
  ImageIcon,
  Loader2,
  PenLine,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel, Pill, SampleNotice, SyntheticPill } from "@/components/vc";
import { extractScreenshotFeedback } from "@/lib/analysis.functions";
import {
  fileKind,
  guessColumns,
  imageToDataUrl,
  matchSource,
  parseSpreadsheet,
  splitTextFeedback,
  type ColumnMap,
  type SheetData,
} from "@/lib/parsers";
import { SAMPLE_COUNT } from "@/lib/sample-data";
import {
  addFeedback,
  clearFeedback,
  loadSampleData,
  removeFeedback,
  removeSampleData,
  useDataset,
} from "@/lib/store";
import { SOURCES, type ExtractedFeedback, type Source } from "@/lib/types";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Data Upload — VOICE OF COPILOT" },
      {
        name: "description",
        content: "Import customer feedback from CSV, Excel, text files, screenshots or manual entry.",
      },
      { property: "og:title", content: "Data Upload — VOICE OF COPILOT" },
      { property: "og:description", content: "Bring every customer feedback channel into one workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UploadPage,
});

const NONE = "__none__";

function SourceSelect({ value, onChange, id }: { value: Source; onChange: (s: Source) => void; id?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Source)}>
      <SelectTrigger id={id} className="w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SOURCES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function UploadPage() {
  const { feedback, dedupe, hasSample } = useDataset();
  const [source, setSource] = useState<Source>("Play Store");

  return (
    <>
      <PageHeader
        eyebrow="Data Upload"
        title="Bring in customer feedback"
        description="Import from spreadsheets, text files, screenshots or type it in. Every item gets a permanent feedback ID so insights can be traced back to the original words."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                const n = loadSampleData();
                toast.success(`Loaded ${n} synthetic Zomato feedback items`);
              }}
            >
              <FlaskConical /> {hasSample ? "Reload" : "Load"} Zomato sample
            </Button>
            <Button asChild variant="brand" disabled={feedback.length === 0}>
              <Link to="/analysis">
                <Sparkles /> Analyze
              </Link>
            </Button>
          </>
        }
      />
      <SampleNotice />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Panel title="Add feedback" description="Choose the channel this feedback came from. Spreadsheet columns named 'source' override it per row.">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Label htmlFor="src" className="text-xs text-muted-foreground sm:w-28">
              Feedback source
            </Label>
            <SourceSelect id="src" value={source} onChange={setSource} />
          </div>
          <Tabs defaultValue="file">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="file">
                <FileSpreadsheet className="mr-1.5 size-4" /> Files
              </TabsTrigger>
              <TabsTrigger value="shot">
                <ImageIcon className="mr-1.5 size-4" /> Screenshot
              </TabsTrigger>
              <TabsTrigger value="manual">
                <PenLine className="mr-1.5 size-4" /> Manual
              </TabsTrigger>
            </TabsList>
            <TabsContent value="file" className="mt-5">
              <FileImport source={source} />
            </TabsContent>
            <TabsContent value="shot" className="mt-5">
              <ScreenshotImport source={source} />
            </TabsContent>
            <TabsContent value="manual" className="mt-5">
              <ManualEntry source={source} />
            </TabsContent>
          </Tabs>
        </Panel>

        <DatasetTable />
      </div>

      {feedback.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          {dedupe.unique.length} unique of {feedback.length} items ·{" "}
          {feedback.length - dedupe.unique.length} duplicates will be excluded from customer counts. Sample data contains{" "}
          {SAMPLE_COUNT} items.
        </p>
      )}
    </>
  );
}

/* ---------------- Files ---------------- */

function FileImport({ source }: { source: Source }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<(SheetData & { fileName: string; ext: "csv" | "excel" }) | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [textEntries, setTextEntries] = useState<{ fileName: string; entries: string[] } | null>(null);
  const [drag, setDrag] = useState(false);

  const reset = () => {
    setSheet(null);
    setMap(null);
    setTextEntries(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    reset();
    if (file.size > 15 * 1024 * 1024) {
      setError("That file is larger than 15 MB. Please split it into smaller files.");
      return;
    }
    const kind = fileKind(file);
    setBusy(true);
    try {
      if (kind === "sheet") {
        const data = await parseSpreadsheet(file);
        setSheet({ ...data, fileName: file.name, ext: /\.(csv|tsv)$/i.test(file.name) ? "csv" : "excel" });
        setMap(guessColumns(data.columns, data.rows));
      } else if (kind === "text") {
        const entries = splitTextFeedback(await file.text());
        if (entries.length === 0) throw new Error("No feedback text found in this file.");
        setTextEntries({ fileName: file.name, entries });
      } else if (kind === "image") {
        throw new Error("For screenshots, use the Screenshot tab so the AI can read the text.");
      } else {
        throw new Error("Unsupported file type. Use CSV, TSV, XLSX, XLS, ODS, TXT or MD.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  };

  const importSheet = () => {
    if (!sheet || !map?.text) return;
    const textCol = map.text;
    const n = addFeedback(
      sheet.rows
        .filter((r) => (r[textCol] ?? "").trim().length > 0)
        .map((r) => {
          const rating = map.rating ? Number.parseFloat(r[map.rating] ?? "") : Number.NaN;
          return {
            text: r[textCol] ?? "",
            source: map.source ? matchSource(r[map.source], source) : source,
            customer: map.customer ? r[map.customer] || undefined : undefined,
            date: map.date ? r[map.date] || undefined : undefined,
            rating: Number.isFinite(rating) ? rating : undefined,
            origin: sheet.ext,
            fileName: sheet.fileName,
          };
        }),
    );
    toast.success(`Imported ${n} feedback items from ${sheet.fileName}`);
    reset();
  };

  const importText = () => {
    if (!textEntries) return;
    const n = addFeedback(
      textEntries.entries.map((text) => ({ text, source, origin: "text", fileName: textEntries.fileName })),
    );
    toast.success(`Imported ${n} feedback items from ${textEntries.fileName}`);
    reset();
  };

  const validRows = sheet && map?.text ? sheet.rows.filter((r) => (r[map.text!] ?? "").trim()).length : 0;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) void handleFile(f);
        }}
        className={`flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${drag ? "border-primary bg-primary-soft" : "bg-muted/50"}`}
      >
        <UploadCloud className="size-8 text-primary" />
        <p className="mt-3 text-sm font-medium text-foreground">Drop a file here or browse</p>
        <p className="mt-1 text-xs text-muted-foreground">CSV, TSV, Excel (.xlsx, .xls), ODS, or text (.txt, .md)</p>
        <Button className="mt-4" variant="soft" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FileText />} Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".csv,.tsv,.xlsx,.xls,.ods,.txt,.md,text/plain,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn't import</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {sheet && map && (
        <div className="space-y-4 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {sheet.fileName} · {sheet.rows.length} rows
            </p>
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Cancel import">
              <X />
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["text", "customer", "date", "rating", "source"] as const).map((k) => (
              <div key={k} className="space-y-1">
                <Label className="text-xs capitalize text-muted-foreground">
                  {k === "text" ? "Feedback text column *" : `${k} column`}
                </Label>
                <Select
                  value={map[k] ?? NONE}
                  onValueChange={(v) => setMap({ ...map, [k]: v === NONE ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {k !== "text" && <SelectItem value={NONE}>Not included</SelectItem>}
                    {sheet.columns.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          {map.text && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Preview</p>
              {sheet.rows.slice(0, 3).map((r, i) => (
                <p key={i} className="line-clamp-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
                  {r[map.text!] || <span className="text-muted-foreground">(empty)</span>}
                </p>
              ))}
            </div>
          )}
          <Button variant="brand" className="w-full" disabled={!map.text || validRows === 0} onClick={importSheet}>
            Import {validRows} feedback items
          </Button>
        </div>
      )}

      {textEntries && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">
              {textEntries.fileName} · {textEntries.entries.length} entries detected
            </p>
            <Button variant="ghost" size="icon" onClick={reset} aria-label="Cancel import">
              <X />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Entries are split by blank lines (or by line if there are none).
          </p>
          <div className="max-h-48 space-y-1.5 overflow-auto">
            {textEntries.entries.slice(0, 6).map((t, i) => (
              <p key={i} className="line-clamp-2 rounded-lg bg-muted px-3 py-2 text-xs text-foreground">
                {t}
              </p>
            ))}
          </div>
          <Button variant="brand" className="w-full" onClick={importText}>
            Import {textEntries.entries.length} feedback items
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Screenshot ---------------- */

function ScreenshotImport({ source }: { source: Source }) {
  const extract = useServerFn(extractScreenshotFeedback);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<(ExtractedFeedback & { keep: boolean })[]>([]);
  const [notes, setNotes] = useState("");

  const choose = async (file: File) => {
    setError(null);
    setItems([]);
    setStatus("idle");
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG or WebP).");
      return;
    }
    try {
      setPreview({ url: await imageToDataUrl(file), name: file.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read this image.");
    }
  };

  const run = async () => {
    if (!preview) return;
    setStatus("loading");
    setError(null);
    try {
      const res = await extract({ data: { imageDataUrl: preview.url } });
      if (!res.ok) {
        setStatus("error");
        setError(res.error);
        return;
      }
      setItems(res.items.map((i) => ({ ...i, keep: true })));
      setNotes(res.notes);
      setStatus("done");
      if (res.items.length === 0) setError("No customer feedback text could be read from this screenshot.");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not reach the AI service.");
    }
  };

  const add = () => {
    const keep = items.filter((i) => i.keep);
    const n = addFeedback(
      keep.map((i) => ({
        text: i.text,
        source,
        customer: i.customer ?? undefined,
        date: i.date ?? undefined,
        rating: i.rating ?? undefined,
        origin: "screenshot",
        fileName: preview?.name,
      })),
    );
    toast.success(`Added ${n} feedback items from screenshot`);
    setItems([]);
    setPreview(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Upload an app-store review, chat, tweet or email screenshot. Gemini transcribes the customer's words exactly —
        you review every item before it's added.
      </p>
      {!preview ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center rounded-xl border-2 border-dashed bg-muted/50 px-6 py-8 text-center transition-colors hover:border-primary hover:bg-primary-soft"
        >
          <ImageIcon className="size-8 text-primary" />
          <span className="mt-3 text-sm font-medium text-foreground">Choose a screenshot</span>
          <span className="mt-1 text-xs text-muted-foreground">PNG, JPG or WebP</span>
        </button>
      ) : (
        <div className="relative overflow-hidden rounded-xl border bg-muted">
          <img src={preview.url} alt="Uploaded screenshot preview" className="max-h-64 w-full object-contain" />
          <Button
            size="icon"
            variant="outline"
            className="absolute right-2 top-2"
            aria-label="Remove screenshot"
            onClick={() => {
              setPreview(null);
              setItems([]);
              setStatus("idle");
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            <X />
          </Button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void choose(f);
        }}
      />
      {preview && status !== "done" && (
        <Button variant="brand" className="w-full" onClick={run} disabled={status === "loading"}>
          {status === "loading" ? (
            <>
              <Loader2 className="animate-spin" /> Reading screenshot…
            </>
          ) : (
            <>
              <Sparkles /> Extract feedback with AI
            </>
          )}
        </Button>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Screenshot not processed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {items.length > 0 && (
        <div className="space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{items.length} messages found</p>
            <Pill tone="warning" className="normal-case">AI transcription — please review</Pill>
          </div>
          {notes && <p className="text-xs text-muted-foreground">Note from AI: {notes}</p>}
          <div className="space-y-2">
            {items.map((it, i) => (
              <label key={i} className="flex cursor-pointer items-start gap-3 rounded-lg bg-muted px-3 py-2.5">
                <Checkbox
                  checked={it.keep}
                  onCheckedChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, keep: v === true } : x)))}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed text-foreground">
                  {it.text}
                  {(it.customer || it.rating) && (
                    <span className="mt-1 block text-muted-foreground">
                      {it.customer && `— ${it.customer}`} {it.rating && `· ${it.rating}★`}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <Button variant="brand" className="w-full" onClick={add} disabled={!items.some((i) => i.keep)}>
            Add {items.filter((i) => i.keep).length} to dataset
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Manual ---------------- */

function ManualEntry({ source }: { source: Source }) {
  const [text, setText] = useState("");
  const [customer, setCustomer] = useState("");
  const [rating, setRating] = useState("");
  const [date, setDate] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) {
      toast.error("Please enter the customer's feedback.");
      return;
    }
    const r = Number.parseFloat(rating);
    addFeedback([
      {
        text,
        source,
        customer: customer.trim() || undefined,
        rating: Number.isFinite(r) ? r : undefined,
        date: date || undefined,
        origin: "manual",
      },
    ]);
    toast.success("Feedback added");
    setText("");
    setRating("");
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="fb-text">Customer feedback (exact words) *</Label>
        <Textarea
          id="fb-text"
          rows={5}
          value={text}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste or type what the customer said…"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="fb-cust">Customer ID / name</Label>
          <Input id="fb-cust" value={customer} maxLength={120} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fb-rating">Rating</Label>
          <Input id="fb-rating" type="number" min={0} max={10} step="0.5" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fb-date">Date</Label>
          <Input id="fb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Adding a customer ID lets the app recognise repeat complaints and avoid counting the same person twice.
      </p>
      <Button type="submit" variant="brand" className="w-full">
        <PenLine /> Add feedback
      </Button>
    </form>
  );
}

/* ---------------- Dataset table ---------------- */

function DatasetTable() {
  const { feedback, dedupe, hasSample } = useDataset();
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<string>("all");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return feedback
      .filter((f) => (src === "all" ? true : f.source === src))
      .filter((f) => !needle || f.text.toLowerCase().includes(needle) || f.id.toLowerCase().includes(needle) || (f.customer ?? "").toLowerCase().includes(needle))
      .slice()
      .reverse();
  }, [feedback, q, src]);

  return (
    <Panel
      title={`Dataset · ${feedback.length} items`}
      description={`${dedupe.unique.length} unique after removing duplicates`}
      action={
        <div className="flex gap-1">
          {hasSample && (
            <Button size="sm" variant="ghost" onClick={() => removeSampleData()}>
              Remove sample
            </Button>
          )}
          {feedback.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-destructive">
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all feedback and analysis?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes every feedback item and the latest analysis from this browser. It can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => clearFeedback()}>Clear everything</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      }
    >
      {feedback.length === 0 ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm font-medium text-foreground">Your dataset is empty</p>
          <p className="mt-1 text-xs text-muted-foreground">Import a file, add feedback manually, or load the synthetic Zomato sample to explore.</p>
          <Button className="mt-4" variant="soft" size="sm" onClick={() => toast.success(`Loaded ${loadSampleData()} synthetic items`)}>
            <FlaskConical /> Load Zomato sample
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text, ID or customer" className="pl-9" />
            </div>
            <Select value={src} onValueChange={setSrc}>
              <SelectTrigger className="sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-[640px] divide-y overflow-auto rounded-xl border">
            {rows.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No matching feedback.</p>}
            {rows.map((f) => {
              const dupOf = dedupe.duplicateOf[f.id];
              return (
                <div key={f.id} className="group flex gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] font-semibold text-foreground">{f.id}</span>
                      <Pill tone="primary" className="normal-case">{f.source}</Pill>
                      {f.origin === "sample" && <SyntheticPill />}
                      {dupOf && <Pill tone="warning" className="normal-case">Duplicate of {dupOf}</Pill>}
                      {f.customer && <span className="text-[11px] text-muted-foreground">{f.customer}</span>}
                      {f.rating != null && <span className="text-[11px] text-muted-foreground">· {f.rating}★</span>}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{f.text}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 opacity-60 group-hover:opacity-100"
                    aria-label={`Delete ${f.id}`}
                    onClick={() => removeFeedback(f.id)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Panel>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  FileText,
  Info,
  Lightbulb,
  Loader2,
  MessageSquareWarning,
  Pencil,
  Scale,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SideBySideBars } from "@/components/charts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, Panel, Pill, SeverityPill, SyntheticPill } from "@/components/vc";
import type { FeedbackRecord } from "@/lib/analysis-contract";
import { compareProducts } from "@/lib/compare-products.functions";
import {
  comparabilityNotes,
  evidenceBySide,
  featureRequestComparison,
  filterToWindow,
  MIN_COMPARE_ITEMS,
  profileDataset,
  sharedWindow,
  sideMetrics,
  themeComparison,
  type ComparabilityNote,
  type DatasetProfile,
  type SideCell,
} from "@/lib/competitor";
import { MAX_UNIQUE_PER_PRODUCT, type ComparisonOutput, type ProductKey } from "@/lib/competitor-contract";
import {
  addCompetitorFeedback,
  createDataset,
  deleteDataset,
  OWN_PRODUCT_ID,
  renameDataset,
  setComparison,
  setOwnProductName,
  useProducts,
  type Product,
} from "@/lib/competitor-store";
import { fileKind, guessColumns, matchSource, parseSpreadsheet, splitTextFeedback, type ColumnMap, type SheetData } from "@/lib/parsers";
import { SOURCES, type FeedbackItem, type Source } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/competitors")({
  head: () => ({
    meta: [
      { title: "Competitor Comparison — VOICE OF COPILOT" },
      {
        name: "description",
        content:
          "Compare two products' customer feedback side by side: shared pain point themes, sentiment, complaint frequency, feature requests and experience opportunities.",
      },
      { property: "og:title", content: "Competitor Comparison — VOICE OF COPILOT" },
      {
        property: "og:description",
        content: "Side-by-side feedback comparison with sample size and collection period disclosed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CompetitorsPage,
});

const NONE = "__none__";
const NEW = "__new__";
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const periodLabel = (p: DatasetProfile) => (p.minDay && p.maxDay ? `${fmtDay(p.minDay)} – ${fmtDay(p.maxDay)}` : "Unknown");

/* ---------------- evidence lookup (own + competitor feedback) ---------------- */

const LookupCtx = createContext<{ byId: Map<string, FeedbackItem>; productOf: (id: string) => string | null }>({
  byId: new Map(),
  productOf: () => null,
});

function ItemRef({ id }: { id: string }) {
  const { byId, productOf } = useContext(LookupCtx);
  const item = byId.get(id);
  const product = productOf(id);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-accent-foreground transition-colors hover:border-primary hover:text-primary"
        >
          {id}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        {item ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-foreground">{item.id}</span>
              {product && <Pill tone="violet" className="normal-case">{product}</Pill>}
              <Pill tone="primary" className="normal-case">{item.source}</Pill>
              {item.origin === "sample" && <SyntheticPill />}
            </div>
            <p className="leading-relaxed text-foreground">“{item.text}”</p>
            <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
              <span>Customer: {item.customer || "Unidentified"}</span>
              {item.date && <span>Date: {item.date}</span>}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">This feedback is no longer in its dataset.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function Refs({ ids, max = 6 }: { ids: string[]; max?: number }) {
  if (ids.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {ids.slice(0, max).map((id) => (
        <ItemRef key={id} id={id} />
      ))}
      {ids.length > max && <span className="text-[11px] text-muted-foreground">+{ids.length - max} more</span>}
    </div>
  );
}

/* ---------------- page ---------------- */

function CompetitorsPage() {
  const { products, byId, state } = useProducts();
  const competitors = products.filter((p) => !p.isOwn);
  const stored = state.comparison;

  const [aId, setAId] = useState<string>(stored?.selection.a ?? OWN_PRODUCT_ID);
  const [bId, setBId] = useState<string>(stored?.selection.b ?? NONE);
  const a = products.find((p) => p.id === aId) ?? null;
  const b = products.find((p) => p.id === bId) ?? competitors.find((p) => p.id !== aId) ?? null;

  const productOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) for (const f of p.feedback) m.set(f.id, p.name);
    return (id: string) => m.get(id) ?? null;
  }, [products]);

  return (
    <LookupCtx.Provider value={{ byId, productOf }}>
      <PageHeader
        eyebrow="Product intelligence"
        title="Competitor Comparison"
        description="Upload competitor feedback as its own dataset, pick two products and compare what their customers say — side by side, from the uploaded feedback only."
      />

      <div className="mb-6 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-xs text-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <span>
          Competitor feedback is stored separately and never mixed into your own analysis. Nothing about a competitor is
          looked up or filled in: every number is counted from the feedback you upload, and every insight links to it.
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <DatasetsPanel products={products} />
        <ImportPanel competitors={competitors} />
      </div>

      <div className="mt-6">
        <SelectionPanel products={products} a={a} b={b} setA={setAId} setB={setBId} />
      </div>

      {stored && <Results stored={stored} products={products} byId={byId} />}
    </LookupCtx.Provider>
  );
}

/* ---------------- datasets ---------------- */

function DatasetsPanel({ products }: { products: Product[] }) {
  return (
    <Panel title="Products" description="Your workspace feedback plus every competitor dataset you've uploaded.">
      <ul className="space-y-2.5">
        {products.map((p) => (
          <DatasetRow key={p.id} product={p} />
        ))}
      </ul>
      {products.length === 1 && (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          No competitor datasets yet. Upload one on the right to start comparing.
        </p>
      )}
    </Panel>
  );
}

function DatasetRow({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(product.name);
  const prof = useMemo(() => profileDataset(product.feedback), [product.feedback]);
  const save = () => {
    if (product.isOwn) setOwnProductName(name);
    else renameDataset(product.id, name);
    setEditing(false);
  };
  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" aria-label="Product name" autoFocus />
              <Button size="sm" type="submit">
                Save
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="font-semibold text-foreground">{product.name}</p>
              <Pill tone={product.isOwn ? "primary" : "violet"} className="normal-case">
                {product.isOwn ? "Your workspace" : "Competitor"}
              </Pill>
              {product.hasSample && <SyntheticPill />}
            </div>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {prof.records} items · {prof.unique} unique · period {periodLabel(prof)}
            {prof.sources[0] ? ` · mostly ${prof.sources[0].source}` : ""}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(true)} aria-label={`Rename ${product.name}`}>
              <Pencil />
            </Button>
            {!product.isOwn && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-negative"
                aria-label={`Delete ${product.name}`}
                onClick={() => {
                  if (window.confirm(`Delete the "${product.name}" dataset and its ${product.feedback.length} feedback items?`)) {
                    deleteDataset(product.id);
                    toast.success(`Deleted ${product.name}`);
                  }
                }}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/* ---------------- import ---------------- */

function ImportPanel({ competitors }: { competitors: Product[] }) {
  const [target, setTarget] = useState<string>(NEW);
  const [newName, setNewName] = useState("");
  const [source, setSource] = useState<Source>("Play Store");
  const effectiveTarget = target !== NEW && competitors.some((c) => c.id === target) ? target : NEW;

  const commit = (items: Omit<FeedbackItem, "id" | "createdAt">[]): boolean => {
    if (effectiveTarget === NEW && !newName.trim()) {
      toast.error("Name the competitor dataset first.");
      return false;
    }
    const id = effectiveTarget === NEW ? createDataset(newName) : effectiveTarget;
    const n = addCompetitorFeedback(id, items);
    toast.success(`Added ${n} competitor feedback items`);
    setTarget(id);
    setNewName("");
    return true;
  };

  return (
    <Panel title="Upload competitor feedback" description="CSV, Excel, text files or pasted text. Only real feedback you collected — the app never generates it.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Add to</Label>
          <Select value={effectiveTarget} onValueChange={setTarget}>
            <SelectTrigger aria-label="Target dataset">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW}>New competitor dataset</SelectItem>
              {competitors.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {effectiveTarget === NEW ? (
          <div className="space-y-1">
            <Label htmlFor="cname" className="text-xs text-muted-foreground">
              Competitor name *
            </Label>
            <Input id="cname" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Swiggy" />
          </div>
        ) : (
          <div />
        )}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Default source</Label>
          <Select value={source} onValueChange={(v) => setSource(v as Source)}>
            <SelectTrigger aria-label="Default source">
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
        </div>
      </div>
      <Tabs defaultValue="file" className="mt-4">
        <TabsList>
          <TabsTrigger value="file">File</TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent value="file">
          <FileImport source={source} onImport={commit} />
        </TabsContent>
        <TabsContent value="paste">
          <PasteImport source={source} onImport={commit} />
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

type Importer = (items: Omit<FeedbackItem, "id" | "createdAt">[]) => boolean;

function FileImport({ source, onImport }: { source: Source; onImport: Importer }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<(SheetData & { fileName: string; ext: "csv" | "excel" }) | null>(null);
  const [map, setMap] = useState<ColumnMap | null>(null);
  const [text, setText] = useState<{ fileName: string; entries: string[] } | null>(null);

  const reset = () => {
    setSheet(null);
    setMap(null);
    setText(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    reset();
    if (file.size > 15 * 1024 * 1024) return setError("That file is larger than 15 MB. Please split it.");
    setBusy(true);
    try {
      const kind = fileKind(file);
      if (kind === "sheet") {
        const data = await parseSpreadsheet(file);
        setSheet({ ...data, fileName: file.name, ext: /\.(csv|tsv)$/i.test(file.name) ? "csv" : "excel" });
        setMap(guessColumns(data.columns, data.rows));
      } else if (kind === "text") {
        const entries = splitTextFeedback(await file.text());
        if (entries.length === 0) throw new Error("No feedback text found in this file.");
        setText({ fileName: file.name, entries });
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
    const col = map.text;
    const ok = onImport(
      sheet.rows
        .filter((r) => (r[col] ?? "").trim())
        .map((r) => {
          const rating = map.rating ? Number.parseFloat(r[map.rating] ?? "") : Number.NaN;
          return {
            text: r[col] ?? "",
            source: map.source ? matchSource(r[map.source], source) : source,
            customer: map.customer ? r[map.customer] || undefined : undefined,
            date: map.date ? r[map.date] || undefined : undefined,
            rating: Number.isFinite(rating) ? rating : undefined,
            origin: sheet.ext,
            fileName: sheet.fileName,
          };
        }),
    );
    if (ok) reset();
  };

  const validRows = sheet && map?.text ? sheet.rows.filter((r) => (r[map.text!] ?? "").trim()).length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center rounded-xl border-2 border-dashed bg-muted/50 px-6 py-6 text-center">
        <UploadCloud className="size-7 text-primary" />
        <p className="mt-2 text-sm font-medium text-foreground">Competitor feedback file</p>
        <p className="mt-1 text-xs text-muted-foreground">CSV, TSV, Excel (.xlsx, .xls), ODS, or text (.txt, .md)</p>
        <Button className="mt-3" variant="soft" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <FileText />} Choose file
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          aria-label="Competitor feedback file"
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
                <Label className="text-xs capitalize text-muted-foreground">{k === "text" ? "Feedback text column *" : `${k} column`}</Label>
                <Select value={map[k] ?? NONE} onValueChange={(v) => setMap({ ...map, [k]: v === NONE ? null : v })}>
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
          {!map.date && (
            <p className="text-xs text-warning">Without a date column, this dataset's collection period will be unknown.</p>
          )}
          <Button variant="brand" className="w-full" disabled={validRows === 0} onClick={importSheet}>
            Import {validRows} feedback items
          </Button>
        </div>
      )}
      {text && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-semibold text-foreground">
            {text.fileName} · {text.entries.length} entries detected
          </p>
          <p className="text-xs text-warning">Text files have no dates, so the collection period will be unknown.</p>
          <Button
            variant="brand"
            className="w-full"
            onClick={() => {
              if (onImport(text.entries.map((t) => ({ text: t, source, origin: "text", fileName: text.fileName })))) reset();
            }}
          >
            Import {text.entries.length} feedback items
          </Button>
        </div>
      )}
    </div>
  );
}

function PasteImport({ source, onImport }: { source: Source; onImport: Importer }) {
  const [value, setValue] = useState("");
  const entries = useMemo(() => splitTextFeedback(value), [value]);
  return (
    <div className="space-y-3">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={6}
        placeholder="Paste competitor reviews — one per line, or separated by blank lines."
        aria-label="Competitor feedback text"
      />
      <Button
        variant="brand"
        className="w-full"
        disabled={entries.length === 0}
        onClick={() => {
          if (onImport(entries.map((t) => ({ text: t, source, origin: "manual" })))) setValue("");
        }}
      >
        Add {entries.length} feedback items
      </Button>
    </div>
  );
}

/* ---------------- selection + comparability ---------------- */

function toRecords(items: FeedbackItem[]): FeedbackRecord[] {
  return items.map((f) => ({
    feedback_id: f.id,
    source: f.source,
    customer_id: f.customer ?? null,
    feedback_text: f.text,
    date: f.date ?? null,
  }));
}

function SelectionPanel({
  products,
  a,
  b,
  setA,
  setB,
}: {
  products: Product[];
  a: Product | null;
  b: Product | null;
  setA: (id: string) => void;
  setB: (id: string) => void;
}) {
  const compare = useServerFn(compareProducts);
  const [sharedOnly, setSharedOnly] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profA = useMemo(() => (a ? profileDataset(a.feedback) : null), [a]);
  const profB = useMemo(() => (b ? profileDataset(b.feedback) : null), [b]);
  const window = profA && profB ? sharedWindow(profA, profB) : null;
  const useWindow = sharedOnly && !!window;

  const scoped = useMemo(() => {
    if (!a || !b) return null;
    const fa = useWindow && window ? filterToWindow(a.feedback, window) : a.feedback;
    const fb = useWindow && window ? filterToWindow(b.feedback, window) : b.feedback;
    return { fa, fb, pa: profileDataset(fa), pb: profileDataset(fb) };
  }, [a, b, useWindow, window]);

  const notes = scoped && a && b ? comparabilityNotes(scoped.pa, scoped.pb, { A: a.name, B: b.name }) : [];
  const same = !!a && !!b && a.id === b.id;
  const canRun = !!scoped && !same && scoped.pa.unique > 0 && scoped.pb.unique > 0 && !running;

  const run = async () => {
    if (!a || !b || !scoped) return;
    setRunning(true);
    setError(null);
    try {
      const res = await compare({
        data: {
          products: [
            { name: a.name, records: toRecords(scoped.fa) },
            { name: b.name, records: toRecords(scoped.fb) },
          ],
        },
      });
      if (!res.ok) {
        setError(res.error.message);
        toast.error("Comparison failed", { description: res.error.message });
        return;
      }
      setComparison({
        output: res.data,
        selection: {
          a: a.id,
          b: b.id,
          sharedPeriodOnly: useWindow,
          window: useWindow ? window : null,
          signatures: { A: a.signature, B: b.signature },
        },
      });
      toast.success("Comparison ready", { description: `${res.data.themes.length} shared themes compared` });
    } catch (err) {
      console.error("compare-products request failed", err);
      const msg = "Couldn't reach the comparison service. Check your connection and try again.";
      setError(msg);
      toast.error("Comparison failed", { description: msg });
    } finally {
      setRunning(false);
    }
  };

  const options = (exclude?: string) =>
    products.map((p) => (
      <SelectItem key={p.id} value={p.id} disabled={p.id === exclude}>
        {p.name}
        {p.isOwn ? " (your workspace)" : ""}
      </SelectItem>
    ));

  return (
    <Panel
      title="Choose two products"
      description="The comparison only uses feedback in these two datasets. Check the comparability notes before reading the results."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(["A", "B"] as const).map((k) => {
          const p = k === "A" ? a : b;
          return (
            <div key={k} className="space-y-1">
              <Label className="text-xs text-muted-foreground">Product {k}</Label>
              <Select value={p?.id ?? NONE} onValueChange={k === "A" ? setA : setB}>
                <SelectTrigger aria-label={`Product ${k}`}>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>{options(k === "A" ? b?.id : a?.id)}</SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {!b ? (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          Upload a competitor dataset above to pick a second product.
        </p>
      ) : same ? (
        <p className="mt-4 text-sm text-negative">Pick two different products.</p>
      ) : (
        scoped &&
        a && (
          <>
            <div className="mt-5 overflow-x-auto">
              <ProfileTable a={a} b={b} pa={scoped.pa} pb={scoped.pb} />
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Switch id="shared" checked={useWindow} onCheckedChange={setSharedOnly} disabled={!window} />
                <Label htmlFor="shared" className="text-sm">
                  Only compare the shared period
                  {window ? ` (${fmtDay(window.from)} – ${fmtDay(window.to)})` : ""}
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {window
                  ? "Feedback outside this window, or without a date, is left out."
                  : "Not available: one product has no dates, or the periods don't overlap."}
              </p>
            </div>

            <NotesList notes={notes} />

            {(scoped.pa.unique > MAX_UNIQUE_PER_PRODUCT || scoped.pb.unique > MAX_UNIQUE_PER_PRODUCT) && (
              <p className="mt-3 text-xs text-warning">
                Only the first {MAX_UNIQUE_PER_PRODUCT} unique items per product are compared in one run.
              </p>
            )}

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle />
                <AlertTitle>Comparison failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button variant="brand" className="mt-4 w-full sm:w-auto" disabled={!canRun} onClick={() => void run()}>
              {running ? <Loader2 className="animate-spin" /> : <Scale />}
              {running ? "Comparing with AI…" : `Compare ${a.name} vs ${b.name}`}
            </Button>
            {running && (
              <p className="mt-2 text-xs text-muted-foreground">This usually takes 20–60 seconds. You can stay on this page.</p>
            )}
          </>
        )
      )}
    </Panel>
  );
}

function ProfileTable({ a, b, pa, pb }: { a: Product; b: Product; pa: DatasetProfile; pb: DatasetProfile }) {
  const rows: [string, ReactNode, ReactNode][] = [
    ["Feedback items", pa.records, pb.records],
    ["Unique after removing duplicates", pa.unique, pb.unique],
    ["Duplicates excluded", pa.duplicates, pb.duplicates],
    ["Customers with an ID", pa.customersIdentified, pb.customersIdentified],
    ["Items without a customer ID", pa.unidentified, pb.unidentified],
    ["Collection period", periodLabel(pa), periodLabel(pb)],
    ["Items with a usable date", `${pa.dated} of ${pa.unique}`, `${pb.dated} of ${pb.unique}`],
    [
      "Main channels",
      pa.sources.slice(0, 3).map((s) => `${s.source} ${s.share}%`).join(", ") || "—",
      pb.sources.slice(0, 3).map((s) => `${s.source} ${s.share}%`).join(", ") || "—",
    ],
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-56">Dataset</TableHead>
          <TableHead>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-primary" /> {a.name} {a.hasSample && <SyntheticPill />}
            </span>
          </TableHead>
          <TableHead>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-violet" /> {b.name} {b.hasSample && <SyntheticPill />}
            </span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(([label, x, y]) => (
          <TableRow key={label}>
            <TableCell className="text-muted-foreground">{label}</TableCell>
            <TableCell className="font-medium text-foreground">{x}</TableCell>
            <TableCell className="font-medium text-foreground">{y}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NotesList({ notes }: { notes: ComparabilityNote[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1.5">
      {notes.map((n) => (
        <li
          key={n.text}
          className={cn(
            "flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
            n.level === "warning" ? "bg-warning-soft text-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {n.level === "warning" ? (
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          ) : (
            <Info className="mt-0.5 size-3.5 shrink-0" />
          )}
          {n.text}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- results ---------------- */

function Results({
  stored,
  products,
  byId,
}: {
  stored: NonNullable<ReturnType<typeof useProducts>["state"]["comparison"]>;
  products: Product[];
  byId: Map<string, FeedbackItem>;
}) {
  const out: ComparisonOutput = stored.output;
  const names = { A: out.products.A.name, B: out.products.B.name };
  const pa = products.find((p) => p.id === stored.selection.a);
  const pb = products.find((p) => p.id === stored.selection.b);
  const stale = !pa || !pb || pa.signature !== stored.selection.signatures.A || pb.signature !== stored.selection.signatures.B;

  const m = { A: sideMetrics(out, "A"), B: sideMetrics(out, "B") };
  const themes = useMemo(() => themeComparison(out, byId), [out, byId]);
  const requests = useMemo(() => featureRequestComparison(out, byId), [out, byId]);
  const profiles = useMemo(() => {
    const pick = (k: ProductKey) => out.products[k].analyzed_ids.flatMap((id) => byId.get(id) ?? []);
    return { A: profileDataset(pick("A")), B: profileDataset(pick("B")) };
  }, [out, byId]);
  const notes = comparabilityNotes(profiles.A, profiles.B, names);
  const smallSide = out.products.A.analyzed_ids.length < MIN_COMPARE_ITEMS || out.products.B.analyzed_ids.length < MIN_COMPARE_ITEMS;

  const sentimentData = (["negative", "mixed", "neutral", "positive"] as const).map((s) => ({
    name: s[0]!.toUpperCase() + s.slice(1),
    a: m.A.sentimentPct[s],
    b: m.B.sentimentPct[s],
  }));
  const complaintThemes = themes
    .filter((t) => t.A.complaints + t.B.complaints > 0)
    .map((t) => ({
      name: t.name,
      a: share(t.A.complaints, out.products.A.analyzed_ids.length),
      b: share(t.B.complaints, out.products.B.analyzed_ids.length),
    }));

  return (
    <div className="mt-8 space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold text-foreground">
          {names.A} <span className="text-muted-foreground">vs</span> {names.B}
        </h2>
        <p className="text-xs text-muted-foreground">
          Compared {new Date(out.meta.generated_at).toLocaleString()} ·{" "}
          {stored.selection.window
            ? `shared period ${fmtDay(stored.selection.window.from)} – ${fmtDay(stored.selection.window.to)}`
            : "all uploaded feedback"}
        </p>
      </div>

      {stale && (
        <div className="flex items-center gap-2 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-foreground">
          <AlertTriangle className="size-4 shrink-0 text-warning" />
          One of these datasets changed since this comparison ran. Results reflect the earlier data — compare again to refresh.
        </div>
      )}

      <Panel title="Summary" description="AI-written assessment of the two datasets. Check the evidence and comparability notes below.">
        <p className="text-sm leading-relaxed text-foreground">{out.summary || "No summary was returned."}</p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((k) => (
          <div key={k} className="rounded-2xl border bg-card p-5 shadow-card">
            <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <span className={cn("size-2 rounded-full", k === "A" ? "bg-primary" : "bg-violet")} /> {names[k]}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <Metric label="Compared" value={m[k].analyzed} hint="unique items" />
              <Metric label="Complaints" value={m[k].complaints} hint="negative or mixed" />
              <Metric label="Complaint rate" value={m[k].complaintRate == null ? "—" : `${m[k].complaintRate}%`} hint="of labelled items" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sentiment distribution" description="Share of each product's labelled feedback.">
          <SideBySideBars data={sentimentData} aName={names.A} bName={names.B} />
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sentiment</TableHead>
                  <TableHead className="text-right">{names.A}</TableHead>
                  <TableHead className="text-right">{names.B}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(["negative", "mixed", "neutral", "positive"] as const).map((s) => (
                  <TableRow key={s}>
                    <TableCell className="capitalize">{s}</TableCell>
                    <TableCell className="text-right">
                      {m.A.sentiment[s]} · {m.A.sentimentPct[s]}%
                    </TableCell>
                    <TableCell className="text-right">
                      {m.B.sentiment[s]} · {m.B.sentimentPct[s]}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>

        <Panel
          title="Complaint frequency by theme"
          description="Complaints in each theme as a share of that product's compared feedback."
        >
          {complaintThemes.length ? (
            <SideBySideBars data={complaintThemes} aName={names.A} bName={names.B} />
          ) : (
            <p className="text-sm text-muted-foreground">No complaints were labelled in either product.</p>
          )}
        </Panel>
      </div>

      <Panel
        title="Common pain point themes"
        description="One shared set of themes for both products. Shares use each product's own total, so different sample sizes stay comparable."
      >
        {smallSide && (
          <p className="mb-3 text-xs text-warning">
            One product has fewer than {MIN_COMPARE_ITEMS} compared items, so differences are shown as insufficient data.
          </p>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">Theme</TableHead>
                <TableHead>{names.A}</TableHead>
                <TableHead>{names.B}</TableHead>
                <TableHead className="text-right">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {themes.map((t) => (
                <TableRow key={t.id} className="align-top">
                  <TableCell>
                    <p className="font-medium text-foreground">{t.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <SeverityPill value={t.severity} />
                      <Pill tone={t.common ? "primary" : "neutral"} className="normal-case">
                        {t.common ? "Common" : t.A.count ? `Only ${names.A}` : `Only ${names.B}`}
                      </Pill>
                    </div>
                  </TableCell>
                  <TableCell>
                    <CellView c={t.A} />
                  </TableCell>
                  <TableCell>
                    <CellView c={t.B} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Diff value={t.diffPp} bName={names.B} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel title="Feature requests" description="Explicit requests found in each product's feedback, grouped across both.">
        {requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No explicit feature requests were found in either dataset.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">Request</TableHead>
                  <TableHead>{names.A}</TableHead>
                  <TableHead>{names.B}</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell>
                      <p className="font-medium text-foreground">{r.title}</p>
                      {r.description && <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>}
                    </TableCell>
                    <TableCell>
                      <CellView c={r.A} />
                    </TableCell>
                    <TableCell>
                      <CellView c={r.B} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Diff value={r.diffPp} bName={names.B} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      <Panel title="Customer experience opportunities" description="AI assessment of contrasts between the two products, with the feedback behind each.">
        {out.opportunities.length === 0 ? (
          <EmptyState icon={<Lightbulb />} title="No opportunities with evidence" description="The AI didn't return any opportunity backed by feedback IDs." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {out.opportunities.map((o) => {
              const ev = evidenceBySide(o.evidence_ids, out);
              return (
                <div key={o.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-foreground">{o.title}</p>
                    <Pill tone="violet" className="normal-case">
                      For {o.for_product === "both" ? "both" : names[o.for_product]}
                    </Pill>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{o.description}</p>
                  {o.next_step && (
                    <p className="mt-2 text-sm text-foreground">
                      <span className="font-medium">Next step:</span> {o.next_step}
                    </p>
                  )}
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 shrink-0 text-muted-foreground">{names.A}</span>
                      <Refs ids={ev.A} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-24 shrink-0 text-muted-foreground">{names.B}</span>
                      <Refs ids={ev.B} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Comparability & evidence" description="Read these before drawing conclusions.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-foreground">Dataset differences</p>
            <NotesList notes={notes} />
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Checks applied</p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>
                  Duplicates excluded: {out.products.A.duplicates_excluded} ({names.A}), {out.products.B.duplicates_excluded} ({names.B})
                </li>
                <li>Unknown feedback IDs removed from AI output: {out.verification.unknown_ids_removed}</li>
                <li>Insights dropped for having no evidence: {out.verification.insights_dropped_no_evidence}</li>
                <li>Items the AI didn't label: {out.verification.unlabeled_records}</li>
                <li>All counts and percentages are calculated by the app, not the AI.</li>
              </ul>
            </div>
            {out.limitations.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-foreground">Limitations</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {out.limitations.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

const share = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function CellView({ c }: { c: SideCell }) {
  if (c.count === 0) return <span className="text-xs text-muted-foreground">Not mentioned</span>;
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-foreground">
        {c.count} <span className="font-normal text-muted-foreground">· {c.pct}%</span>
      </p>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <MessageSquareWarning className="size-3" /> {c.complaints} complaints · {c.customers} customers
        {c.unidentified ? ` +${c.unidentified} no ID` : ""}
      </p>
      <Refs ids={c.ids} max={3} />
    </div>
  );
}

function Diff({ value, bName }: { value: number | null; bName: string }) {
  if (value == null) return <span className="text-xs text-muted-foreground">Insufficient data</span>;
  if (value === 0) return <span className="text-sm text-muted-foreground">Same share</span>;
  return (
    <span className="text-sm font-medium text-foreground" title={`${bName} share minus the other product's share`}>
      {value > 0 ? "+" : ""}
      {value} pts
      <span className="block text-[10px] font-normal text-muted-foreground">{value > 0 ? `higher for ${bName}` : `lower for ${bName}`}</span>
    </span>
  );
}

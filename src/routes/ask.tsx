import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Database, LoaderCircle, MessageSquareText, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, SyntheticPill } from "@/components/vc";
import { AskAnswerView } from "@/components/ask-answer";
import { useProducts, OWN_PRODUCT_ID } from "@/lib/competitor-store";
import { askFeedback } from "@/lib/ask-feedback.functions";
import { MAX_QUESTION_CHARS } from "@/lib/ask-contract";
import { ALL_FEEDBACK, buildAskInput, selectAskProducts, type ChatTurn } from "@/lib/ask-chat";

export const Route = createFileRoute("/ask")({
  head: () => ({ meta: [
    { title: "Ask Your Feedback — VOICE OF COPILOT" },
    { name: "description", content: "Ask questions across your product and competitor feedback with contextual follow-ups, original quotes and linked evidence." },
    { property: "og:title", content: "Ask Your Feedback — VOICE OF COPILOT" },
    { property: "og:description", content: "Evidence-backed conversations about your selected customer feedback." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AskPage,
});

const STARTERS = ["What is our biggest customer pain point?", "Why are customers uninstalling?", "Which issue should we fix first?", "What are customers saying about refunds?", "Which themes are increasing?"];

function AskPage() {
  const { products } = useProducts();
  const ask = useServerFn(askFeedback);
  const [scope, setScope] = useState(ALL_FEEDBACK);
  const [conversations, setConversations] = useState<Record<string, ChatTurn[]>>({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const selected = selectAskProducts(products, scope);
  const label = scope === ALL_FEEDBACK ? "All Feedback" : scope === OWN_PRODUCT_ID ? "Primary Product Only" : selected[0]?.name ?? "Dataset unavailable";
  // Scope and data changes isolate context so another product never inherits stale claims.
  const contextKey = `${scope}:${selected.map((p) => `${p.id}:${p.signature}`).join("|")}`;
  const turns = conversations[contextKey] ?? [];
  const total = selected.reduce((sum, p) => sum + p.feedback.length, 0);
  const hasSample = selected.some((p) => p.hasSample);

  useEffect(() => { if (turns.length || pending) endRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" }); }, [turns.length, pending]);

  async function send(question = draft) {
    const q = question.trim();
    if (!q || q.length > MAX_QUESTION_CHARS || !total || inFlight.current) return;
    inFlight.current = true;
    setPending(q);
    setDraft("");
    setError(null);
    try {
      const result = await ask({ data: buildAskInput(selected, label, turns, q) });
      if (!result.ok) { setError(result.error.message); setDraft(q); return; }
      const turn: ChatTurn = { id: result.data.meta.answer_id, question: q, answer: result.data };
      setConversations((previous) => ({ ...previous, [contextKey]: [...(previous[contextKey] ?? []), turn] }));
    } catch {
      setError("The answer could not be completed. Your question is saved below; you can try again.");
      setDraft(q);
    } finally { inFlight.current = false; setPending(null); }
  }

  return <>
    <PageHeader eyebrow="Product intelligence" title="Ask Your Feedback" actions={<Button variant="outline" disabled={!!pending || turns.length === 0} onClick={() => { setConversations((prev) => ({ ...prev, [contextKey]: [] })); setError(null); setDraft(""); }}><Plus />New conversation</Button>} />
    <div className="flex flex-col gap-3 border-y py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:max-w-sm"><label id="dataset-label" className="text-xs font-semibold text-muted-foreground">Selected datasets</label>
        <Select value={scope} disabled={!!pending} onValueChange={(value) => { setScope(value); setDraft(""); setError(null); }}><SelectTrigger aria-labelledby="dataset-label"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value={ALL_FEEDBACK}>All Feedback</SelectItem><SelectItem value={OWN_PRODUCT_ID}>Primary Product Only</SelectItem>
          {products.filter((p) => !p.isOwn).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} · {p.feedback.length} items</SelectItem>)}
        </SelectContent></Select>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Database className="size-4" />{selected.length} {selected.length === 1 ? "dataset" : "datasets"} · {total} feedback items{hasSample && <SyntheticPill />}</div>
    </div>
    {hasSample && <p className="mt-3 text-xs text-violet">Selected feedback includes synthetic sample data, not real customer feedback.</p>}
    <div className="mx-auto max-w-3xl py-6">
      {!total ? <div className="flex flex-col items-center gap-4 py-16 text-center"><Database className="size-8 text-primary" /><h2 className="text-lg font-semibold">No feedback in this selection</h2><div className="flex flex-wrap justify-center gap-2"><Button asChild><Link to="/upload">Add primary feedback</Link></Button><Button asChild variant="outline"><Link to="/competitors">Competitor datasets</Link></Button></div></div> : turns.length === 0 && !pending ? <div className="py-10"><div className="mb-8 text-center"><MessageSquareText className="mx-auto mb-4 size-8 text-primary" /><h2 className="text-xl font-semibold">What do you want to know?</h2></div><div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">{STARTERS.map((q) => <Button key={q} variant="outline" className="h-auto min-h-14 whitespace-normal px-4 py-3 text-left text-sm" onClick={() => send(q)}><Sparkles className="text-primary" />{q}</Button>)}</div></div> : null}
      <div role="log" aria-label="Feedback conversation" className="space-y-8">
        {turns.map((t) => <div key={t.id} className="space-y-5"><div className="ml-auto w-fit max-w-[90%] rounded-lg bg-secondary px-4 py-3"><p className="whitespace-pre-wrap break-words text-sm">{t.question}</p></div><AskAnswerView answer={t.answer} onFollowUp={send} disabled={!!pending} /></div>)}
        {pending && <div className="space-y-5"><p className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-lg bg-secondary px-4 py-3 text-sm">{pending}</p><p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 motion-safe:animate-spin" />Reading selected feedback…</p></div>}
      </div>
      <div ref={endRef} />
      {error && <div role="alert" className="mt-5 rounded-lg border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative">{error}</div>}
      <form className="sticky bottom-0 mt-8 border-t bg-background py-4" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <div className="flex items-end gap-2 rounded-lg border bg-card p-2 focus-within:ring-1 focus-within:ring-ring"><Textarea aria-label="Ask a question about your feedback" placeholder="Ask about your selected feedback…" value={draft} maxLength={MAX_QUESTION_CHARS} disabled={!!pending || !total} onChange={(e) => setDraft(e.target.value)} className="max-h-48 min-h-20 resize-y border-0 shadow-none focus-visible:ring-0" /><Button type="submit" size="icon" aria-label="Send question" disabled={!!pending || !total || !draft.trim()}>{pending ? <LoaderCircle className="motion-safe:animate-spin" /> : <ArrowUp />}</Button></div>
        <p className="mt-2 text-right text-[11px] text-muted-foreground">{draft.length}/{MAX_QUESTION_CHARS}</p>
      </form>
    </div>
  </>;
}
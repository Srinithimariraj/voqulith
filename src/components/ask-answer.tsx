import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Pill, SyntheticPill } from "@/components/vc";
import { useProducts } from "@/lib/competitor-store";
import type { AskAnswer, Segment } from "@/lib/ask-contract";
import { AlertTriangle, Quote } from "lucide-react";

function AskRef({ id }: { id: string }) {
  const { products, byId } = useProducts();
  const item = byId.get(id);
  const product = products.find((p) => p.feedback.some((f) => f.id === id));
  return <Popover>
    <PopoverTrigger asChild><Button variant="soft" size="sm" className="mx-0.5 h-6 px-1.5 font-mono text-[11px]" aria-label={`View feedback ${id}`}>{id}</Button></PopoverTrigger>
    <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
      {item ? <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><strong>{product?.name}</strong><Pill tone="primary">{item.source}</Pill>{item.origin === "sample" && <SyntheticPill />}</div>
        <p className="whitespace-pre-wrap break-words leading-relaxed">{item.text}</p>
        <p className="text-xs text-muted-foreground">Customer: {item.customer || "Unidentified"}{item.date ? ` · ${item.date}` : ""}</p>
      </div> : <p className="text-sm text-muted-foreground">This feedback is no longer in the selected dataset.</p>}
    </PopoverContent>
  </Popover>;
}

function Segments({ value }: { value: Segment[] }) {
  return <>{value.map((s, i) => s.t === "ref" ? <AskRef key={i} id={s.id} /> : <span key={i}>{s.v}</span>)}</>;
}

export function AskAnswerView({ answer, onFollowUp, disabled }: { answer: AskAnswer; onFollowUp: (q: string) => void; disabled: boolean }) {
  const unverified = answer.verification.unverified_numbers.length > 0;
  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center gap-2"><Pill tone={answer.status === "answered" ? "positive" : "warning"}>{answer.status === "answered" ? "Evidence linked" : answer.status === "partial" ? "Limited evidence" : "Insufficient evidence"}</Pill><span className="text-xs text-muted-foreground">{answer.scope.label} · {answer.scope.analyzed_items} unique items read</span></div>
    {unverified ? <p role="status" className="flex gap-2 text-sm text-warning"><AlertTriangle className="size-4 shrink-0" />The draft included numbers that could not be verified. Only computed evidence totals and verified quotes are shown.</p> : <p className="whitespace-pre-wrap break-words text-sm leading-7"><Segments value={answer.answer} /></p>}
    {!unverified && answer.findings.length > 0 && <div className="space-y-4 border-l-2 border-primary/20 pl-4">
      {answer.findings.map((f) => <div key={f.id} className="space-y-2">
        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6"><Segments value={f.point} /></p>
        <p className="text-xs text-muted-foreground">{f.items} feedback items · {f.customers} identified customers · {f.share}% of feedback read{f.unidentified ? ` · ${f.unidentified} without customer IDs` : ""}</p>
        <div className="flex flex-wrap gap-1">{f.feedback_ids.map((id) => <AskRef key={id} id={id} />)}</div>
      </div>)}
    </div>}
    {answer.quotes.length > 0 && <div className="space-y-3">
      {answer.quotes.map((q, i) => <blockquote key={`${q.feedback_id}-${i}`} className="border-l-2 border-violet/30 bg-violet-soft/40 px-4 py-3">
        <Quote className="mb-2 size-4 text-violet" /><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{q.quote}</p>
        <footer className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><AskRef id={q.feedback_id} /><span>{q.product} · {q.source}</span></footer>
      </blockquote>)}
    </div>}
    {answer.evidence.feedback_ids.length > 0 && <details className="text-xs"><summary className="cursor-pointer font-medium text-muted-foreground">Supporting feedback · {answer.evidence.items} items · {answer.evidence.customers} identified customers</summary><div className="mt-3 flex flex-wrap gap-1">{answer.evidence.feedback_ids.map((id) => <AskRef key={id} id={id} />)}</div></details>}
    {answer.limitations.length > 0 && <div className="text-xs text-muted-foreground"><p className="mb-1 font-semibold">Evidence limitations</p><ul className="list-disc space-y-1 pl-4">{answer.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul></div>}
    {answer.follow_ups.length > 0 && <div className="flex flex-wrap gap-2">{answer.follow_ups.map((q) => <Button key={q} variant="outline" size="sm" disabled={disabled} className="h-auto max-w-full whitespace-normal py-2 text-left" onClick={() => onFollowUp(q)}>{q}</Button>)}</div>}
  </div>;
}
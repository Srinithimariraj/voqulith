<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Feedback and the latest analysis live in browser storage (`src/lib/store.ts`); there is no account system yet, so nothing is shared between users.
- All AI calls go through server functions (`analyze-feedback.functions.ts`, `analysis.functions.ts`) → `analysis.server.ts` on the Lovable AI Gateway; the browser never sees model keys.
- The analyze-feedback input/output contract (snake_case records in, evidence-linked JSON out) lives in `src/lib/analysis-contract.ts`; change it there and keep `fromApiResponse` in sync so the dashboard keeps rendering.
- AI output is never shown raw: `groundAnalysis` (src/lib/grounding.ts) drops unknown IDs, rejects non-verbatim quotes/churn evidence, and computes all counts/customers itself — keep every new insight type flowing through it.
- Duplicate rules live in `src/lib/dedupe.ts`; only unique feedback is sent to the AI and counted as customers.
- Sample data in `src/lib/sample-data.ts` is synthetic and must stay labelled as such in the UI (origin "sample").
- Impact Measurement metrics (customers affected, theme share, complaint trends, period comparison) are pure functions in `src/lib/impact.ts`, computed from current unique feedback plus grounded labels; % changes are only produced when both periods meet the minimum-data rule, so trends are never estimated.
- Ask chat reads primary and competitor data through `useProducts`, builds requests in `ask-chat.ts`, and calls the existing grounded server function; conversation context is isolated by dataset selection and signature to prevent stale cross-product evidence.
- Ask answers render validated segments and source-record popovers for both product stores; prose containing unverified numeric claims is withheld so only programmatically computed totals and verified quotes remain visible.

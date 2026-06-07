# portfolio-chat-bot-worker

A Cloudflare Worker that powers the AI chat assistant on [jia-wei.site](https://jia-wei.site). Visitors can ask questions about Jia Wei's background, skills, projects, and experience, and receive answers grounded in his actual portfolio content.

## How It Works

1. **Seeding** — portfolio content (about, skills, projects, experience, education) is embedded with Gemini Embedding 2 and stored as 3072-dimensional vectors in a Supabase pgvector table.
2. **Chat** — incoming messages run through a ReAct agent that decides when to retrieve, calls the `retrieve_portfolio` tool against Supabase, then generates a grounded answer.
3. **History** — conversation context is persisted in Cloudflare KV per session (1-hour TTL) so the AI remembers earlier turns in the same chat.

## Agent Architecture — ReAct

This project uses the **ReAct (Reasoning + Acting)** pattern via LangChain v1's `createAgent`, which is backed by LangGraph's `ReactAgent` under the hood. Instead of always retrieving on every message, the LLM decides whether and what to search for, observes the result, and then responds.

The loop for a single user turn:

```
┌────────────────────────────────────────────────────────────────┐
│  User: "What projects has Jia Wei built?"                       │
└────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  REASON  Gemini reads conversation history + new message       │
│          → "I need portfolio data. Call retrieve_portfolio."   │
└────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  ACT     retrieve_portfolio({ query: "projects Jia Wei" })     │
│          → embed query (Gemini Embedding 2, 3072 dims)         │
│          → Supabase RPC: match_portfolio_documents             │
│          → returns top-5 chunks above threshold 0.5            │
└────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  OBSERVE Retrieved chunks injected into the next prompt        │
└────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  REASON  Gemini reads original question + retrieved context    │
│          → "I have enough info. Write the final answer."       │
└────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────┐
│  RESPOND  "Jia Wei has built portfolio-chat-bot-worker..."     │
└────────────────────────────────────────────────────────────────┘
```

The loop is multi-step capable — if the first retrieval doesn't surface enough information, the agent can issue a refined second query before responding.

### Why ReAct over a fixed RAG chain?

Earlier iterations of this project used an LCEL chain that **always** ran retrieval on every message. That approach has two problems:

| Question type | Fixed RAG chain | ReAct agent |
|---|---|---|
| "Hi" / "Thanks" | Pointlessly retrieves chunks, wastes embedding API call | LLM responds directly, no retrieval |
| "What is the capital of France?" | Retrieves irrelevant chunks, may confuse the response | LLM declines (per system prompt), no retrieval |
| "Tell me about Jia Wei's projects" | Single retrieval, single answer | Single retrieval, single answer (same) |
| "Compare his React experience to his Vue experience" | Single ambiguous retrieval | Can issue two focused queries if needed |

Net effect: lower embedding cost, no irrelevant context polluting answers, and the system prompt's "only answer questions about Jia Wei" rule is enforced before retrieval rather than after.

### The tool definition

The `retrieve_portfolio` tool is declared with a Zod schema and `responseFormat: "content_and_artifact"` (see `src/chain.ts`):

```typescript
tool(
  async ({ query }) => {
    const docs = await retriever.invoke(query);
    const serialized = docs.map(d => `[${d.metadata.title}]\n${d.pageContent}`).join("\n\n");
    return [serialized, docs];  // [content shown to LLM, raw artifact for tracing]
  },
  {
    name: "retrieve_portfolio",
    description: "Search the portfolio knowledge base for information about...",
    schema: z.object({ query: z.string() }),
    responseFormat: "content_and_artifact",
  },
)
```

`content_and_artifact` returns a tuple — the **content** (formatted string) goes back to the LLM as the tool result; the **artifact** (raw `Document[]`) is preserved on the message for LangSmith traces and downstream inspection.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (TypeScript) |
| LLM | Gemini (`gemini-3.1-flash-lite`) via `@langchain/google-genai` |
| Embeddings | Gemini Embedding 2 (3072 dims) |
| Vector store | Supabase pgvector |
| Agent framework | LangChain v1 + LangGraph `ReactAgent` (via `createAgent`) |
| Session history | Cloudflare KV |
| Tracing | LangSmith (optional) |

## Project Structure

```
src/
  handlers/
    chat.ts           # POST /api/chat — main chat endpoint
    documents.ts      # GET/POST/DELETE /api/documents — admin CRUD
    seed.ts           # POST /api/seed — embed & upsert data.ts chunks
  chain.ts            # RAG agent (createAgent + retrieve_portfolio tool)
  retriever.ts        # LangChain BaseRetriever → Supabase vector search
  history.ts          # LangChain BaseChatMessageHistory → Cloudflare KV
  utils.ts            # Shared: Supabase client, embeddings, LangSmith tracer
  types.ts            # Env interface
  database.types.ts   # Supabase database schema types
  constants.ts        # Model names, TOP_K, MATCH_THRESHOLD, CORS headers
  data.ts             # Static portfolio content chunks (seed data)
  index.ts            # Worker entry point — routing only
public/
  index.html          # Admin panel UI
  admin.js            # Admin panel logic
wrangler.jsonc        # Worker config (KV binding, assets)
```

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account
- A Supabase project with the vector store schema applied (see below)
- A Google AI API key (for Gemini)

## Supabase Setup

Run these two migrations in your Supabase project (SQL editor or via MCP):

**1. Create the vector store**
```sql
create extension if not exists vector;

create table portfolio_documents (
  id         text primary key,
  content    text not null,
  embedding  vector(3072),
  category   text,
  title      text,
  created_at timestamptz default now()
);

create or replace function match_portfolio_documents(
  query_embedding vector,
  match_count     int     default 5,
  match_threshold float   default 0.5
)
returns table (id text, content text, category text, title text, similarity float)
language sql stable as $$
  select id, content, category, title,
    1 - (embedding <=> query_embedding) as similarity
  from portfolio_documents
  where 1 - (embedding <=> query_embedding) > match_threshold
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

> Note: pgvector's HNSW index supports a maximum of 2000 dimensions. Since Gemini Embedding 2 outputs 3072 dims, no index is created — a sequential scan is fine for a small portfolio dataset.

## Installation

```bash
npm install
```

## Environment Variables

All secrets are set via Wrangler and never committed to the repo.

### Required secrets
```bash
wrangler secret put GEMINI_API_KEY        # Google AI API key
wrangler secret put SUPABASE_URL          # e.g. https://xxxx.supabase.co
wrangler secret put SUPABASE_SERVICE_KEY  # Supabase service role key
wrangler secret put SEED_SECRET           # Admin panel password (any string)
```

### Optional secrets
```bash
wrangler secret put LANGSMITH_API_KEY     # LangSmith tracing (optional)
wrangler secret put LANGSMITH_PROJECT     # LangSmith project name
```

Non-sensitive config (`LANGSMITH_TRACING`, `LANGSMITH_ENDPOINT`) lives in the `vars` block of `wrangler.jsonc`.

For local development, create a `.dev.vars` file (already in `.gitignore`):
```
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SEED_SECRET=...
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=portfolio
```

## Development

```bash
npm run dev
```

Runs at `http://localhost:8787`. KV is simulated locally in `.wrangler/state/v3/kv/` — it does **not** write to the production KV namespace. To test against production KV:

```bash
npx wrangler dev --remote
```

## Deployment

```bash
npm run deploy
```

## Admin Panel

Visit the worker URL in a browser. Log in with your `SEED_SECRET` to access the content manager.

| Button | What it does |
|---|---|
| **Add Document** | Manually add a content chunk (embeds on save) |
| **Load Defaults** | Embeds and upserts all chunks from `src/data.ts` |

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat` | None | Chat with the AI assistant |
| `GET` | `/api/documents` | Bearer | List all documents |
| `POST` | `/api/documents` | Bearer | Add a document |
| `DELETE` | `/api/documents/:id` | Bearer | Delete a document |
| `POST` | `/api/seed` | Bearer | Seed from `data.ts` |

### Chat request/response

```json
// POST /api/chat
{ "message": "What projects has Jia Wei built?", "sessionId": null }

// Response
{ "text": "Jia Wei has built...", "sessionId": "uuid-v4" }
```

Pass the returned `sessionId` on subsequent requests to maintain conversation context.

## Model Selection

Two models are used: one for generating answers, one for embedding content. Both choices were made deliberately for this use case.

### Chat model — `gemini-3.1-flash-lite`

| Model | Provider | Approx. latency | Input cost (per 1M tokens) | Reasoning quality | Decision |
|---|---|---|---|---|---|
| `gemini-3.1-flash-lite` | Google | ~200–350 ms | ~$0.075 | Good for factual Q&A | **Chosen** |
| `gemini-3.1-flash` | Google | ~400–600 ms | ~$0.15 | Better multi-step reasoning | Overkill for bounded domain |
| `gemini-3.1-pro` | Google | ~800 ms+ | ~$1.25 | Best reasoning | Overkill + expensive |
| `claude-haiku-4-5` | Anthropic | ~200–350 ms | ~$0.80 | Excellent instruction following | 10× more expensive, different provider dependency |
| `gemma-4-27b-it` | Google / self-hosted | ~200–500 ms | Free (self-hosted) / ~$0.10 via Vertex | Good open-source performance | Requires infra; worthwhile for privacy-sensitive deployments |

**Rationale:** The portfolio domain is intentionally bounded — questions are factual ("What is Jia Wei's current role?") and the relevant context is already retrieved and injected before the LLM responds. Complex reasoning is not needed.

- **`flash-lite` over `flash`/`pro`**: sufficient quality at lowest latency and cost. Flash-lite wins on price-to-performance for constrained Q&A.
- **`flash-lite` over `claude-haiku-4-5`**: Haiku has excellent instruction-following but costs ~10× more per token with no measurable quality gain for this use case. It would be the preferred choice if the project were already on the Anthropic stack.
- **`flash-lite` over `gemma-4-27b-it`**: Gemma 4 is the right call for privacy-first use cases (PII, sensitive content) since it can run fully on-device or in a private VPC with no data leaving your infrastructure. For a public portfolio chatbot with no sensitive data, the operational overhead isn't justified.

> Prices are indicative — verify current rates at [Google AI pricing](https://ai.google.dev/pricing) and [Anthropic pricing](https://www.anthropic.com/pricing).

### Embedding model — `gemini-embedding-2`

| Model | Dimensions | Notes | Decision |
|---|---|---|---|
| `gemini-embedding-2` | 3072 | Current, high-quality semantic embeddings | **Chosen** |
| `text-embedding-004` | 768 | Deprecated by Google | Rejected |

**Rationale:** Higher dimensions capture richer semantic relationships, improving retrieval accuracy for short-form portfolio content where subtle phrasing matters. The 3072-dimension vectors also mean no HNSW index can be created (pgvector max: 2000 dims), but a sequential scan is negligible for a dataset of this size (<500 rows).

---

## Retrieval Eval Results

Evaluated with `npm run eval` against 9 representative questions using `MATCH_THRESHOLD=0.5`, `TOP_K=5`. Full traces in LangSmith under project `portfolio`.

| Question | Hit | Top similarity |
|---|---|---|
| What is Jia Wei's current job title and company? | ✓ | 0.751 |
| What front-end frameworks and libraries does Jia Wei use? | ✓ | 0.784 |
| What programming languages does Jia Wei know? | ✓ | 0.749 |
| What is the portfolio chat bot project about? | ✓ | 0.714 |
| Where did Jia Wei study and what did he study? | ✓ | 0.722 |
| How can I contact Jia Wei? | ✓ | 0.849 |
| What is Jia Wei's GitHub profile? | ✓ | 0.820 |
| What are Jia Wei's recent projects? | ✓ | 0.736 |
| Tell me about Jia Wei's work experience history | ✓ | 0.717 |
| **Average** | **9 / 9 (100%)** | **0.760** |

All 9 questions retrieved at least one relevant chunk above the 0.5 threshold. The lowest similarity (0.714, "portfolio chat bot") is still well above the threshold — indicating the current `MATCH_THRESHOLD=0.5` is not overly strict for this dataset.

To re-run or tune retrieval parameters:

```bash
npm run eval                               # default: threshold=0.5, top_k=5
npm run eval -- --threshold 0.4 --topk 8  # compare alternate settings in LangSmith
```

## Useful Commands

```bash
npm run dev          # Local dev server
npm run deploy       # Deploy to Cloudflare
npm run check        # Type check + dry-run build
npx wrangler tail    # Stream live logs from the deployed worker
```

# portfolio-chat-bot-worker

A Cloudflare Worker that powers the AI chat assistant on [jia-wei.site](https://jia-wei.site). Visitors can ask questions about Jia Wei's background, skills, projects, and experience, and receive answers grounded in his actual portfolio content.

## How It Works

1. **Seeding** — portfolio content (about, skills, projects, experience, education) is embedded with Gemini Embedding 2 and stored as 3072-dimensional vectors in a Supabase pgvector table.
2. **Chat** — each user message is embedded, a cosine similarity search retrieves the most relevant content chunks from Supabase, and Gemini generates a grounded answer.
3. **History** — conversation context is persisted in Cloudflare KV per session (1-hour TTL) so the AI remembers earlier turns in the same chat.
4. **Agent** — built with LangChain's `createAgent` (LangGraph ReAct agent). The LLM decides when to call the `retrieve_portfolio` tool rather than always retrieving.

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (TypeScript) |
| LLM | Gemini (`gemini-3.1-flash-lite`) via `@langchain/google-genai` |
| Embeddings | Gemini Embedding 2 (3072 dims) |
| Vector store | Supabase pgvector |
| Agent framework | LangChain v1 + LangGraph (`createAgent`) |
| Session history | Cloudflare KV |
| Tracing | LangSmith (optional) |

## Project Structure

```
src/
  handlers/
    chat.ts           # POST /api/chat — main chat endpoint
    documents.ts      # GET/POST/DELETE /api/documents — admin CRUD
    seed.ts           # POST /api/seed — embed & upsert data.ts chunks
    sync-github.ts    # POST /api/sync-github — sync public GitHub repos
    sync-website.ts   # POST /api/sync-website — scrape & chunk jia-wei.site
  chain.ts            # RAG agent (createAgent + retrieve_portfolio tool)
  retriever.ts        # LangChain BaseRetriever → Supabase vector search
  history.ts          # LangChain BaseChatMessageHistory → Cloudflare KV
  utils.ts            # Shared: embeddings, Supabase helpers, LangSmith tracer
  types.ts            # Env interface, PortfolioMatch
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
wrangler secret put GITHUB_USERNAME       # Your GitHub username
```

### Optional secrets
```bash
wrangler secret put GITHUB_TOKEN          # GitHub token (avoids rate limits)
wrangler secret put PORTFOLIO_SITE_URL    # Defaults to https://jia-wei.site
wrangler secret put LANGSMITH_API_KEY     # LangSmith tracing (optional)
wrangler secret put LANGSMITH_PROJECT     # LangSmith project name
```

For local development, create a `.dev.vars` file (already in `.gitignore`):
```
GEMINI_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SEED_SECRET=...
GITHUB_USERNAME=...
GITHUB_TOKEN=...
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
| **Sync GitHub Repos** | Fetches your public repos via GitHub API, embeds, and upserts |
| **Sync Website** | Scrapes `jia-wei.site`, splits by heading, embeds, and upserts |

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/chat` | None | Chat with the AI assistant |
| `GET` | `/api/documents` | Bearer | List all documents |
| `POST` | `/api/documents` | Bearer | Add a document |
| `DELETE` | `/api/documents/:id` | Bearer | Delete a document |
| `POST` | `/api/seed` | Bearer | Seed from `data.ts` |
| `POST` | `/api/sync-github` | Bearer | Sync GitHub repos |
| `POST` | `/api/sync-website` | Bearer | Sync from website |

### Chat request/response

```json
// POST /api/chat
{ "message": "What projects has Jia Wei built?", "sessionId": null }

// Response
{ "text": "Jia Wei has built...", "sessionId": "uuid-v4" }
```

Pass the returned `sessionId` on subsequent requests to maintain conversation context.

## Useful Commands

```bash
npm run dev          # Local dev server
npm run deploy       # Deploy to Cloudflare
npm run check        # Type check + dry-run build
npx wrangler tail    # Stream live logs from the deployed worker
```

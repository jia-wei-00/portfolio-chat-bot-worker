import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { Env, PortfolioMatch } from "./types";
import { portfolioData } from "./data";
import { KVChatHistory } from "./history";
import { createRAGChain } from "./chain";
import {
  EMBEDDING_MODEL,
  TOP_K,
  MATCH_THRESHOLD,
  CORS_HEADERS,
} from "./constants";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight for all /api/* routes
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    // All /api/* routes require auth
    const auth = request.headers.get("Authorization");
    const isAuthed = auth === `Bearer ${env.SEED_SECRET}`;

    if (url.pathname === "/api/chat" && request.method === "POST") {
      // Chat is called from your portfolio site — no admin auth needed
      return handleChatRequest(request, env);
    }

    if (!isAuthed) {
      return new Response("Unauthorized", {
        status: 401,
        headers: CORS_HEADERS,
      });
    }

    if (url.pathname === "/api/documents") {
      if (request.method === "GET") return handleListDocuments(env);
      if (request.method === "POST") return handleAddDocument(request, env);
    }

    if (
      url.pathname.startsWith("/api/documents/") &&
      request.method === "DELETE"
    ) {
      const id = url.pathname.slice("/api/documents/".length);
      return handleDeleteDocument(id, env);
    }

    if (url.pathname === "/api/seed" && request.method === "POST") {
      return handleSeedRequest(env);
    }

    if (url.pathname === "/api/sync-github" && request.method === "POST") {
      return handleGitHubSync(env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function makeEmbeddings(env: Env): GoogleGenerativeAIEmbeddings {
  return new GoogleGenerativeAIEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey: env.GEMINI_API_KEY,
  });
}

async function embedText(text: string, env: Env): Promise<number[]> {
  return makeEmbeddings(env).embedQuery(text);
}

function supabaseHeaders(env: Env): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    apikey: env.SUPABASE_SERVICE_KEY,
  };
}

async function upsertDocuments(
  rows: Array<{
    id: string;
    content: string;
    embedding: number[];
    category: string;
    title: string;
  }>,
  env: Env,
): Promise<void> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/portfolio_documents`, {
    method: "POST",
    headers: { ...supabaseHeaders(env), Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: ${await res.text()}`);
}

// ─── Chat (called from portfolio site) ───────────────────────────────────────

async function handleChatRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const body = (await request.json()) as {
      message?: string;
      sessionId?: string;
    };

    const userMessage = body.message?.trim();
    if (!userMessage) {
      return new Response(JSON.stringify({ error: "No user message" }), {
        status: 400,
        headers: { "content-type": "application/json", ...CORS_HEADERS },
      });
    }

    const sessionId = body.sessionId ?? crypto.randomUUID();

    // Build the RAG chain and wrap it with KV-backed message history
    const ragChain = await createRAGChain(env);
    const chainWithHistory = new RunnableWithMessageHistory({
      runnable: ragChain,
      getMessageHistory: (sid) => new KVChatHistory(env.KV_SESSIONS, sid),
      inputMessagesKey: "input",
      historyMessagesKey: "chat_history",
    });

    const answer = await chainWithHistory.invoke(
      { input: userMessage },
      { configurable: { sessionId } },
    );

    return new Response(JSON.stringify({ text: answer, sessionId }), {
      headers: { "content-type": "application/json", ...CORS_HEADERS },
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process request" }),
      {
        status: 500,
        headers: { "content-type": "application/json", ...CORS_HEADERS },
      },
    );
  }
}

// ─── Document management (admin) ─────────────────────────────────────────────

async function handleListDocuments(env: Env): Promise<Response> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/portfolio_documents?select=id,title,category,content,created_at&order=created_at.asc`,
    { headers: supabaseHeaders(env) },
  );
  if (!res.ok) throw new Error(`Supabase list failed: ${await res.text()}`);
  const docs = await res.json();
  return new Response(JSON.stringify(docs), {
    headers: { "content-type": "application/json" },
  });
}

async function handleAddDocument(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const { title, category, content } = (await request.json()) as {
      title: string;
      category: string;
      content: string;
    };

    if (!title || !category || !content) {
      return new Response(
        JSON.stringify({ error: "title, category, and content are required" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }

    const id = `${category}-${crypto.randomUUID()}`;
    const embedding = await embedText(content, env);

    await upsertDocuments([{ id, content, embedding, category, title }], env);

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Error adding document:", error);
    return new Response(JSON.stringify({ error: "Failed to add document" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function handleDeleteDocument(id: string, env: Env): Promise<Response> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/portfolio_documents?id=eq.${encodeURIComponent(id)}`,
    { method: "DELETE", headers: supabaseHeaders(env) },
  );
  if (!res.ok) throw new Error(`Supabase delete failed: ${await res.text()}`);
  return new Response(JSON.stringify({ success: true }), {
    headers: { "content-type": "application/json" },
  });
}

async function handleSeedRequest(env: Env): Promise<Response> {
  try {
    // Batch-embed all chunks in a single API call
    const texts = portfolioData.map((c) => c.text);
    const vectors = await makeEmbeddings(env).embedDocuments(texts);

    const rows = portfolioData.map((chunk, i) => ({
      id: chunk.id,
      content: chunk.text,
      embedding: vectors[i],
      category: chunk.category,
      title: chunk.title,
    }));

    await upsertDocuments(rows, env);

    return new Response(JSON.stringify({ success: true, count: rows.length }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("Error seeding:", error);
    return new Response(JSON.stringify({ error: "Failed to seed data" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

// ─── GitHub sync ──────────────────────────────────────────────────────────────

interface GitHubRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  fork: boolean;
  archived: boolean;
}

async function handleGitHubSync(env: Env): Promise<Response> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "portfolio-chat-bot",
    };
    if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

    // Fetch all public repos (up to 100)
    const res = await fetch(
      `https://api.github.com/users/${env.GITHUB_USERNAME}/repos?per_page=100&sort=updated&type=public`,
      { headers },
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitHub API error: ${err}`);
    }

    const repos: GitHubRepo[] = await res.json();

    // Skip forks and archived repos
    const active = repos.filter((r) => !r.fork && !r.archived);

    // Build a text chunk per repo
    const chunks = active.map((repo) => {
      const topics = repo.topics?.length
        ? `Topics: ${repo.topics.join(", ")}.`
        : "";
      const lang = repo.language ? `Language: ${repo.language}.` : "";
      const stars =
        repo.stargazers_count > 0 ? `Stars: ${repo.stargazers_count}.` : "";
      const desc = repo.description ?? "No description provided.";

      return {
        id: `github-${repo.name}`,
        category: "projects",
        title: repo.name,
        text: `Project: ${repo.name}. ${desc} ${lang} ${topics} ${stars} GitHub: ${repo.html_url}`.trim(),
      };
    });

    if (chunks.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          message: "No active public repos found.",
        }),
        { headers: { "content-type": "application/json" } },
      );
    }

    // Batch embed and upsert
    const texts = chunks.map((c) => c.text);
    const vectors = await makeEmbeddings(env).embedDocuments(texts);

    const rows = chunks.map((chunk, i) => ({
      id: chunk.id,
      content: chunk.text,
      embedding: vectors[i],
      category: chunk.category,
      title: chunk.title,
    }));

    await upsertDocuments(rows, env);

    return new Response(
      JSON.stringify({
        success: true,
        count: rows.length,
        repos: chunks.map((c) => c.title),
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    console.error("GitHub sync error:", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

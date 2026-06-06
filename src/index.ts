import { Env } from "@/types";
import { CORS_HEADERS } from "@/constants";
import { handleChatRequest } from "@/handlers/chat";
import {
  handleListDocuments,
  handleAddDocument,
  handleDeleteDocument,
} from "@/handlers/documents";
import { handleSeedRequest } from "@/handlers/seed";
import { handleGitHubSync } from "@/handlers/sync-github";
import { handleWebsiteSync } from "@/handlers/sync-website";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      console.log("came");
      return handleChatRequest(request, env);
    }

    const auth = request.headers.get("Authorization");
    const isAuthed = auth === `Bearer ${env.SEED_SECRET}`;
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

    if (url.pathname === "/api/sync-website" && request.method === "POST") {
      return handleWebsiteSync(env);
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

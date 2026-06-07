export interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	GEMINI_API_KEY: string;
	SEED_SECRET: string;
	KV_SESSIONS: KVNamespace;
	// LangSmith tracing
	LANGSMITH_TRACING?: string;
	LANGSMITH_API_KEY?: string;
	LANGSMITH_ENDPOINT?: string;
	LANGSMITH_PROJECT?: string;
}

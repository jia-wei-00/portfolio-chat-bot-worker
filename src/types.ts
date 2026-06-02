export interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	GEMINI_API_KEY: string;
	SEED_SECRET: string;
	GITHUB_USERNAME: string;
	GITHUB_TOKEN: string;
	KV_SESSIONS: KVNamespace;
	PORTFOLIO_SITE_URL?: string;
	// LangSmith tracing
	LANGSMITH_TRACING?: string;
	LANGSMITH_API_KEY?: string;
	LANGSMITH_ENDPOINT?: string;
	LANGSMITH_PROJECT?: string;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface PortfolioMatch {
	id: string;
	content: string;
	category: string;
	title: string;
	similarity: number;
}

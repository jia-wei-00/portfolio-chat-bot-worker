export interface Env {
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	SUPABASE_URL: string;
	SUPABASE_SERVICE_KEY: string;
	GEMINI_API_KEY: string;
	SEED_SECRET: string;
	GITHUB_USERNAME: string;
	GITHUB_TOKEN: string;
	KV_SESSIONS: KVNamespace;
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

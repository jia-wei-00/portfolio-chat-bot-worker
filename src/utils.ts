import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";
import { Env } from "./types";
import { EMBEDDING_MODEL } from "./constants";

export function makeEmbeddings(env: Env): GoogleGenerativeAIEmbeddings {
	return new GoogleGenerativeAIEmbeddings({
		model: EMBEDDING_MODEL,
		apiKey: env.GEMINI_API_KEY,
	});
}

export async function embedText(text: string, env: Env): Promise<number[]> {
	return makeEmbeddings(env).embedQuery(text);
}

export function supabaseHeaders(env: Env): Record<string, string> {
	return {
		"Content-Type": "application/json",
		Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
		apikey: env.SUPABASE_SERVICE_KEY,
	};
}

export async function upsertDocuments(
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

export function makeTracer(env: Env): LangChainTracer | undefined {
	if (!env.LANGSMITH_API_KEY) return undefined;
	return new LangChainTracer({
		projectName: env.LANGSMITH_PROJECT ?? "portfolio",
		client: new Client({
			apiKey: env.LANGSMITH_API_KEY,
			apiUrl: env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com",
		}),
	});
}

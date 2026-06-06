import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";
import { Env } from "@/types";
import { Database } from "@/database.types";
import { EMBEDDING_MODEL } from "@/constants";

export type Supabase = SupabaseClient<Database>;

export function getSupabase(env: Env): Supabase {
	return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
		auth: { persistSession: false },
	});
}

export function makeEmbeddings(env: Env): GoogleGenerativeAIEmbeddings {
	return new GoogleGenerativeAIEmbeddings({
		model: EMBEDDING_MODEL,
		apiKey: env.GEMINI_API_KEY,
	});
}

export async function embedText(text: string, env: Env): Promise<number[]> {
	return makeEmbeddings(env).embedQuery(text);
}

export async function upsertDocuments(
	supabase: Supabase,
	rows: Array<{
		id: string;
		content: string;
		embedding: number[];
		category: string;
		title: string;
	}>,
): Promise<void> {
	const { error } = await supabase.from("portfolio_documents").upsert(rows);
	if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
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

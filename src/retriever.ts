import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Env, PortfolioMatch } from "./types";
import { TOP_K, MATCH_THRESHOLD } from "./constants";

export class PortfolioRetriever extends BaseRetriever {
	lc_namespace = ["portfolio", "retriever"];

	constructor(
		private embeddings: GoogleGenerativeAIEmbeddings,
		private env: Env,
	) {
		super();
	}

	async _getRelevantDocuments(query: string): Promise<Document[]> {
		const embedding = await this.embeddings.embedQuery(query);

		const res = await fetch(
			`${this.env.SUPABASE_URL}/rest/v1/rpc/match_portfolio_documents`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.env.SUPABASE_SERVICE_KEY}`,
					apikey: this.env.SUPABASE_SERVICE_KEY,
				},
				body: JSON.stringify({
					query_embedding: embedding,
					match_count: TOP_K,
					match_threshold: MATCH_THRESHOLD,
				}),
			},
		);

		if (!res.ok) throw new Error(`Supabase search failed: ${await res.text()}`);
		const matches: PortfolioMatch[] = await res.json();

		return matches.map(
			(m) =>
				new Document({
					pageContent: m.content,
					metadata: { title: m.title, category: m.category, id: m.id },
				}),
		);
	}
}

import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { Env } from "@/types";
import { getSupabase } from "@/utils";
import { TOP_K, MATCH_THRESHOLD } from "@/constants";

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
		const supabase = getSupabase(this.env);

		const { data: matches, error } = await supabase.rpc("match_portfolio_documents", {
			query_embedding: embedding,
			match_count: TOP_K,
			match_threshold: MATCH_THRESHOLD,
		});

		if (error) throw new Error(`Supabase search failed: ${error.message}`);

		return (matches ?? []).map(
			(m) =>
				new Document({
					pageContent: m.content,
					metadata: { title: m.title, category: m.category, id: m.id },
				}),
		);
	}
}

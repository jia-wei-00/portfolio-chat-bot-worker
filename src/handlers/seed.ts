import { Env } from "../types";
import { portfolioData } from "../data";
import { makeEmbeddings, upsertDocuments } from "../utils";

export async function handleSeedRequest(env: Env): Promise<Response> {
	try {
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
		console.error("Seed error:", error);
		return new Response(JSON.stringify({ error: "Failed to seed data" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
}

import { Env } from "../types";
import { supabaseHeaders, embedText, upsertDocuments } from "../utils";

export async function handleListDocuments(env: Env): Promise<Response> {
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

export async function handleAddDocument(request: Request, env: Env): Promise<Response> {
	try {
		const { title, category, content } = (await request.json()) as {
			title: string;
			category: string;
			content: string;
		};

		if (!title || !category || !content) {
			return new Response(
				JSON.stringify({ error: "title, category, and content are required" }),
				{ status: 400, headers: { "content-type": "application/json" } },
			);
		}

		const id = `${category}-${crypto.randomUUID()}`;
		const embedding = await embedText(content, env);

		await upsertDocuments([{ id, content, embedding, category, title }], env);

		return new Response(JSON.stringify({ success: true, id }), {
			headers: { "content-type": "application/json" },
		});
	} catch (error) {
		console.error("Add document error:", error);
		return new Response(JSON.stringify({ error: "Failed to add document" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
}

export async function handleDeleteDocument(id: string, env: Env): Promise<Response> {
	const res = await fetch(
		`${env.SUPABASE_URL}/rest/v1/portfolio_documents?id=eq.${encodeURIComponent(id)}`,
		{ method: "DELETE", headers: supabaseHeaders(env) },
	);
	if (!res.ok) throw new Error(`Supabase delete failed: ${await res.text()}`);
	return new Response(JSON.stringify({ success: true }), {
		headers: { "content-type": "application/json" },
	});
}

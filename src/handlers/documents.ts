import { Env } from "@/types";
import { getSupabase, embedText, upsertDocuments } from "@/utils";

export async function handleListDocuments(env: Env): Promise<Response> {
	const supabase = getSupabase(env);
	const { data, error } = await supabase
		.from("portfolio_documents")
		.select("id, title, category, content, created_at")
		.order("created_at", { ascending: true });

	if (error) throw new Error(`Supabase list failed: ${error.message}`);
	return new Response(JSON.stringify(data), {
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

		await upsertDocuments(getSupabase(env), [{ id, content, embedding, category, title }]);

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
	const supabase = getSupabase(env);
	const { error } = await supabase.from("portfolio_documents").delete().eq("id", id);

	if (error) throw new Error(`Supabase delete failed: ${error.message}`);
	return new Response(JSON.stringify({ success: true }), {
		headers: { "content-type": "application/json" },
	});
}

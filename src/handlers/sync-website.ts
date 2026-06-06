import { Env } from "@/types";
import { makeEmbeddings, upsertDocuments, getSupabase } from "@/utils";

function htmlToTextChunks(
	html: string,
): Array<{ id: string; title: string; text: string; category: string }> {
	const clean = html
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<script\b[\s\S]*?<\/script>/gi, "")
		.replace(/<style\b[\s\S]*?<\/style>/gi, "");

	const chunks: Array<{ id: string; title: string; text: string; category: string }> = [];
	const sectionRe = /<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>([\s\S]*?)(?=<h[1-3]\b|$)/gi;
	let match: RegExpExecArray | null;

	while ((match = sectionRe.exec(clean)) !== null) {
		const title = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
		const body = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

		if (!title || body.length < 20) continue;

		const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/-$/, "");
		const MAX_CHARS = 1000;

		if (body.length <= MAX_CHARS) {
			chunks.push({ id: `website-${slug}`, title, text: `${title}\n${body}`, category: "website" });
		} else {
			let part = 1;
			for (let i = 0; i < body.length; i += MAX_CHARS - 100) {
				chunks.push({
					id: `website-${slug}-${part}`,
					title: `${title} (${part})`,
					text: `${title}\n${body.slice(i, i + MAX_CHARS).trim()}`,
					category: "website",
				});
				part++;
				if (i + MAX_CHARS >= body.length) break;
			}
		}
	}

	// Fallback: no headings found — chunk the whole visible text
	if (chunks.length === 0) {
		const text = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
		const MAX_CHARS = 1000;
		let n = 1;
		for (let i = 0; i < text.length; i += MAX_CHARS - 100, n++) {
			const slice = text.slice(i, i + MAX_CHARS).trim();
			if (slice.length > 50) {
				chunks.push({ id: `website-chunk-${n}`, title: `Portfolio (${n})`, text: slice, category: "website" });
			}
			if (i + MAX_CHARS >= text.length) break;
		}
	}

	return chunks;
}

export async function handleWebsiteSync(env: Env): Promise<Response> {
	try {
		const siteUrl = env.PORTFOLIO_SITE_URL ?? "https://jia-wei.site";
		const res = await fetch(siteUrl, { headers: { "User-Agent": "portfolio-chat-bot/1.0" } });
		if (!res.ok) throw new Error(`Failed to fetch ${siteUrl}: ${res.status}`);

		const chunks = htmlToTextChunks(await res.text());

		if (chunks.length === 0) {
			return new Response(
				JSON.stringify({ success: true, count: 0, message: "No content extracted from site." }),
				{ headers: { "content-type": "application/json" } },
			);
		}

		const vectors = await makeEmbeddings(env).embedDocuments(chunks.map((c) => c.text));
		const rows = chunks.map((chunk, i) => ({
			id: chunk.id,
			content: chunk.text,
			embedding: vectors[i],
			category: chunk.category,
			title: chunk.title,
		}));

		await upsertDocuments(getSupabase(env), rows);

		return new Response(
			JSON.stringify({ success: true, count: rows.length, sections: chunks.map((c) => c.title) }),
			{ headers: { "content-type": "application/json" } },
		);
	} catch (error) {
		console.error("Website sync error:", error);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
}

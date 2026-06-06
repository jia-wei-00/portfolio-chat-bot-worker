import { Env } from "@/types";
import { makeEmbeddings, upsertDocuments, getSupabase } from "@/utils";

interface GitHubRepo {
	name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	topics: string[];
	stargazers_count: number;
	fork: boolean;
	archived: boolean;
}

export async function handleGitHubSync(env: Env): Promise<Response> {
	try {
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "portfolio-chat-bot",
		};
		if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;

		const res = await fetch(
			`https://api.github.com/users/${env.GITHUB_USERNAME}/repos?per_page=100&sort=updated&type=public`,
			{ headers },
		);
		if (!res.ok) throw new Error(`GitHub API error: ${await res.text()}`);

		const repos: GitHubRepo[] = await res.json();
		const active = repos.filter((r) => !r.fork && !r.archived);

		const chunks = active.map((repo) => {
			const topics = repo.topics?.length ? `Topics: ${repo.topics.join(", ")}.` : "";
			const lang = repo.language ? `Language: ${repo.language}.` : "";
			const stars = repo.stargazers_count > 0 ? `Stars: ${repo.stargazers_count}.` : "";
			const desc = repo.description ?? "No description provided.";
			return {
				id: `github-${repo.name}`,
				category: "projects",
				title: repo.name,
				text: `Project: ${repo.name}. ${desc} ${lang} ${topics} ${stars} GitHub: ${repo.html_url}`.trim(),
			};
		});

		if (chunks.length === 0) {
			return new Response(
				JSON.stringify({ success: true, count: 0, message: "No active public repos found." }),
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
			JSON.stringify({ success: true, count: rows.length, repos: chunks.map((c) => c.title) }),
			{ headers: { "content-type": "application/json" } },
		);
	} catch (error) {
		console.error("GitHub sync error:", error);
		return new Response(JSON.stringify({ error: String(error) }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
}

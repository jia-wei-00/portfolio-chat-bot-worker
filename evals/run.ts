/**
 * Retrieval eval — measures whether the vector search returns relevant chunks.
 *
 * Runs against Supabase directly (no Worker needed).
 * Results are logged to LangSmith as a named experiment.
 *
 * Usage:
 *   npm run eval
 *   npm run eval -- --threshold 0.4 --topk 8   (tune params)
 */

import * as fs from "fs";
import * as path from "path";
import { Client } from "langsmith";
import { evaluate } from "langsmith/evaluation";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { dataset, type EvalCase } from "./dataset";

// ── Load env from .dev.vars ────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
	const devVarsPath = path.resolve(__dirname, "../.dev.vars");
	if (!fs.existsSync(devVarsPath)) {
		throw new Error(".dev.vars not found — copy .dev.vars.example and fill in your secrets");
	}
	const vars: Record<string, string> = {};
	for (const line of fs.readFileSync(devVarsPath, "utf-8").split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		vars[key] = val;
	}
	return vars;
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function getArg(flag: string, fallback: string): string {
	const idx = process.argv.indexOf(flag);
	return idx !== -1 ? process.argv[idx + 1] : fallback;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const env = loadEnv();

const MATCH_THRESHOLD = parseFloat(getArg("--threshold", "0.5"));
const TOP_K = parseInt(getArg("--topk", "5"), 10);
const DATASET_ID = getArg("--dataset-id", "");     // use an existing LangSmith dataset by ID
const EXPERIMENT_NAME = `retrieval-threshold${MATCH_THRESHOLD}-topk${TOP_K}`;
const DATASET_NAME = "portfolio-retrieval-qa";

const LANGSMITH_ENDPOINT = env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com";
const LANGSMITH_PROJECT = env.LANGSMITH_PROJECT ?? "portfolio";

console.log(`\nRunning eval: threshold=${MATCH_THRESHOLD}, top_k=${TOP_K}`);
console.log(`Dataset ID  : ${DATASET_ID || "(auto — create by name)"}`);
console.log(`LangSmith   : ${LANGSMITH_ENDPOINT} / project="${LANGSMITH_PROJECT}"`);
console.log(`API key     : ${env.LANGSMITH_API_KEY ? env.LANGSMITH_API_KEY.slice(0, 8) + "..." : "MISSING ⚠"}`);
console.log(`Experiment  : "${EXPERIMENT_NAME}"\n`);

if (!env.LANGSMITH_API_KEY) {
	console.error("ERROR: LANGSMITH_API_KEY is not set in .dev.vars");
	process.exit(1);
}

const lsClient = new Client({
	apiKey: env.LANGSMITH_API_KEY,
	apiUrl: LANGSMITH_ENDPOINT,
});

const embeddings = new GoogleGenerativeAIEmbeddings({
	model: "gemini-embedding-2",
	apiKey: env.GEMINI_API_KEY,
});

// ── Target: embed question → search Supabase ──────────────────────────────────

async function retrievalTarget(inputs: { question: string; category: string }) {
	const embedding = await embeddings.embedQuery(inputs.question);

	const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/match_portfolio_documents`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
			apikey: env.SUPABASE_SERVICE_KEY,
		},
		body: JSON.stringify({
			query_embedding: embedding,
			match_count: TOP_K,
			match_threshold: MATCH_THRESHOLD,
		}),
	});

	if (!res.ok) throw new Error(`Supabase error: ${await res.text()}`);

	const matches: Array<{ id: string; content: string; title: string; category: string; similarity: number }> =
		await res.json();

	return {
		chunks: matches,
		chunk_count: matches.length,
		top_similarity: matches[0]?.similarity ?? 0,
		combined_text: matches.map((m) => `[${m.title}]\n${m.content}`).join("\n\n"),
	};
}

// ── Evaluators ────────────────────────────────────────────────────────────────

/** 1 if any retrieved chunk contains at least one expected keyword, else 0 */
function keywordHit({
	outputs,
	referenceOutputs,
}: {
	outputs: Record<string, any>;
	referenceOutputs?: Record<string, any>;
}) {
	const text = (outputs.combined_text ?? "").toLowerCase();
	const keywords: string[] = referenceOutputs?.expected_keywords ?? [];
	const hit = keywords.some((kw) => text.includes(kw.toLowerCase()));
	return { key: "keyword_hit", score: hit ? 1 : 0 };
}

/** The similarity score of the best-matching chunk (0 if nothing retrieved) */
function topSimilarity({ outputs }: { outputs: Record<string, any> }) {
	return { key: "top_similarity", score: outputs.top_similarity ?? 0 };
}

/** How many chunks were returned — useful for detecting over/under-retrieval */
function chunkCount({ outputs }: { outputs: Record<string, any> }) {
	return { key: "chunk_count", score: outputs.chunk_count ?? 0 };
}

// ── Dataset helpers ───────────────────────────────────────────────────────────

async function populateDataset(datasetId: string) {
	console.log(`  Uploading ${dataset.length} examples...`);
	try {
		await lsClient.createExamples({
			datasetId,
			inputs: dataset.map((c: EvalCase) => ({ question: c.question, category: c.category })),
			outputs: dataset.map((c: EvalCase) => ({ expected_keywords: c.expected_keywords })),
		});
		console.log(`  ✓ Examples uploaded`);
		console.log(`  View dataset: ${LANGSMITH_ENDPOINT.replace("api.", "")}/o/~/datasets/${datasetId}\n`);
	} catch (err) {
		console.error(`  ✗ createExamples failed:`, err);
		throw err;
	}
}

async function ensureDataset(): Promise<string> {
	// Use an existing dataset by ID if provided — populate it if empty
	if (DATASET_ID) {
		console.log(`Looking up dataset ${DATASET_ID}...`);
		let ds;
		try {
			ds = await lsClient.readDataset({ datasetId: DATASET_ID });
			console.log(`  Found: "${ds.name}"`);
		} catch (err) {
			console.error(`  ✗ Could not read dataset — check the ID and that your API key has access`);
			throw err;
		}

		let count = 0;
		for await (const _ of lsClient.listExamples({ datasetId: DATASET_ID })) count++;

		if (count === 0) {
			console.log(`  Dataset is empty — uploading examples from dataset.ts`);
			await populateDataset(DATASET_ID);
		} else {
			console.log(`  ${count} examples already present — skipping upload\n`);
		}
		return DATASET_ID;
	}

	// Default: delete and recreate by name so dataset.ts stays the source of truth
	for await (const ds of lsClient.listDatasets({ datasetName: DATASET_NAME })) {
		console.log(`Syncing dataset "${DATASET_NAME}" — removing stale examples`);
		await lsClient.deleteDataset({ datasetId: ds.id });
		break;
	}

	console.log(`Creating dataset "${DATASET_NAME}" (${dataset.length} examples)`);
	const ds = await lsClient.createDataset(DATASET_NAME, {
		description: "Portfolio RAG retrieval eval — questions about Jia Wei",
	});
	await populateDataset(ds.id);
	return ds.id;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const datasetId = await ensureDataset();

	const results = await evaluate(retrievalTarget, {
		data: datasetId,
		evaluators: [keywordHit, topSimilarity, chunkCount],
		experimentPrefix: EXPERIMENT_NAME,
		client: lsClient,
		maxConcurrency: 3,
	});

	// ── Print summary ──────────────────────────────────────────────────────────

	const rows = await results.results;
	let totalHit = 0;
	let totalSimilarity = 0;
	let totalChunks = 0;

	console.log("\n── Results ──────────────────────────────────────────────────");
	console.log(
		`${"Question".padEnd(55)} ${"Hit".padEnd(5)} ${"Sim".padEnd(6)} Chunks`,
	);
	console.log("─".repeat(75));

	for (const row of rows) {
		const question = (row.example?.inputs?.question ?? "").slice(0, 52);
		const hit = row.evaluationResults?.results?.find((r: any) => r.key === "keyword_hit")?.score ?? 0;
		const sim = row.evaluationResults?.results?.find((r: any) => r.key === "top_similarity")?.score ?? 0;
		const chunks = row.evaluationResults?.results?.find((r: any) => r.key === "chunk_count")?.score ?? 0;

		totalHit += hit;
		totalSimilarity += sim;
		totalChunks += chunks;

		const hitIcon = hit === 1 ? "✓" : "✗";
		console.log(
			`${question.padEnd(55)} ${hitIcon.padEnd(5)} ${sim.toFixed(3).padEnd(6)} ${chunks}`,
		);
	}

	const n = rows.length;
	console.log("─".repeat(75));
	console.log(`${"AVERAGE".padEnd(55)} ${(totalHit / n).toFixed(2).padEnd(5)} ${(totalSimilarity / n).toFixed(3).padEnd(6)} ${(totalChunks / n).toFixed(1)}`);

	console.log(`
── Summary ──────────────────────────────────────────────────
  Keyword hit rate : ${((totalHit / n) * 100).toFixed(0)}%  (target: ≥ 80%)
  Avg top similarity: ${(totalSimilarity / n).toFixed(3)}  (higher = better match quality)
  Avg chunks returned: ${(totalChunks / n).toFixed(1)} / ${TOP_K}  (low = threshold too strict)

  Current settings: MATCH_THRESHOLD=${MATCH_THRESHOLD}, TOP_K=${TOP_K}
  ${totalHit / n < 0.8 && totalChunks / n < 2 ? "⚠  Low hit rate + few chunks → try lowering --threshold" : ""}
  ${totalHit / n < 0.8 && totalChunks / n >= TOP_K ? "⚠  Low hit rate but chunks maxed → try raising --topk" : ""}
  ${totalHit / n >= 0.8 ? "✓  Hit rate looks good" : ""}

  Full traces: https://smith.langchain.com
`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});

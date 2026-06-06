import { createAgent } from "langchain";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { z } from "zod";
import { Env } from "@/types";
import { PortfolioRetriever } from "@/retriever";
import { CHAT_MODEL, EMBEDDING_MODEL } from "@/constants";

const SYSTEM_PROMPT =
	"You are an AI assistant exclusively for Jia Wei's personal portfolio website. " +
	"Your only purpose is to answer questions about Jia Wei — his background, skills, projects, work experience, education, and contact information. " +
	"Always use the retrieve_portfolio tool to find relevant information before answering. " +
	"If the user asks about anything unrelated to Jia Wei (e.g. general knowledge, other people, coding help, current events), " +
	"do NOT attempt to answer. Instead reply with exactly: " +
	"\"I'm only able to answer questions about Jia Wei. Feel free to ask me about his skills, projects, experience, or how to get in touch!\" " +
	"If the retrieved information does not cover a question about Jia Wei, say you don't have that information and suggest the visitor reach out directly.";

export function createRAGAgent(env: Env) {
	const llm = new ChatGoogleGenerativeAI({
		model: CHAT_MODEL,
		apiKey: env.GEMINI_API_KEY,
		maxOutputTokens: 1024,
	});

	const retriever = new PortfolioRetriever(
		new GoogleGenerativeAIEmbeddings({ model: EMBEDDING_MODEL, apiKey: env.GEMINI_API_KEY }),
		env,
	);

	const retrieveTool = tool(
		async ({ query }) => {
			const docs = await retriever.invoke(query);
			const serialized = docs.map((d) => `[${d.metadata.title}]\n${d.pageContent}`).join("\n\n");
			return [serialized, docs];
		},
		{
			name: "retrieve_portfolio",
			description:
				"Search the portfolio knowledge base for information about the owner's background, skills, projects, experience, education, and contact details.",
			schema: z.object({
				query: z.string().describe("The search query to find relevant portfolio information"),
			}),
			responseFormat: "content_and_artifact" as const,
		},
	);

	return createAgent({
		model: llm,
		tools: [retrieveTool],
		systemPrompt: SYSTEM_PROMPT,
	});
}

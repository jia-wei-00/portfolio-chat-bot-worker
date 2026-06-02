import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { RunnableSequence, RunnablePassthrough, RunnableLambda } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { BaseMessage } from "@langchain/core/messages";
import { Env } from "./types";
import { PortfolioRetriever } from "./retriever";
import { CHAT_MODEL, EMBEDDING_MODEL } from "./constants";

// Step 1 — Reformulate the user question into a standalone question when chat history exists
const CONTEXTUALIZE_PROMPT = ChatPromptTemplate.fromMessages([
	[
		"system",
		"Given a chat history and the latest user question which might reference context in the chat history, " +
		"formulate a standalone question that can be understood without the chat history. " +
		"Do NOT answer the question — just reformulate it if needed, otherwise return it as is.",
	],
	new MessagesPlaceholder("chat_history"),
	["human", "{input}"],
]);

// Step 3 — Answer using retrieved context + conversation history
const QA_PROMPT = ChatPromptTemplate.fromMessages([
	[
		"system",
		"You are a helpful AI assistant on a personal portfolio website. " +
		"Answer questions about the portfolio owner based solely on the context below. " +
		"Be friendly, concise, and professional. If something is not covered, say you don't have that information and suggest the visitor reach out directly.\n\n" +
		"Context:\n{context}",
	],
	new MessagesPlaceholder("chat_history"),
	["human", "{input}"],
]);

export function createRAGChain(env: Env) {
	const llm = new ChatGoogleGenerativeAI({
		model: CHAT_MODEL,
		apiKey: env.GEMINI_API_KEY,
		maxOutputTokens: 1024,
	});

	const embeddings = new GoogleGenerativeAIEmbeddings({
		model: EMBEDDING_MODEL,
		apiKey: env.GEMINI_API_KEY,
	});

	const retriever = new PortfolioRetriever(embeddings, env);

	// Step 1: reformulate question if chat history exists
	const reformulateQuestion = new RunnableLambda({
		func: async (input: { input: string; chat_history: BaseMessage[] }) => {
			if (!input.chat_history?.length) return input.input;
			return CONTEXTUALIZE_PROMPT
				.pipe(llm)
				.pipe(new StringOutputParser())
				.invoke(input);
		},
	});

	// Full RAG chain using LCEL
	return RunnableSequence.from([
		// Assign standalone (reformulated) question
		RunnablePassthrough.assign({
			standalone_question: reformulateQuestion,
		}),
		// Retrieve relevant portfolio docs and format them
		RunnablePassthrough.assign({
			context: new RunnableLambda({
				func: async (input: { standalone_question: string }) => {
					const docs: Document[] = await retriever.invoke(input.standalone_question);
					return docs.map((d) => `[${d.metadata.title}]\n${d.pageContent}`).join("\n\n");
				},
			}),
		}),
		// QA prompt → LLM → plain text answer
		QA_PROMPT,
		llm,
		new StringOutputParser(),
	]);
}

import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { Env } from "@/types";
import { KVChatHistory } from "@/history";
import { createRAGAgent } from "@/chain";
import { makeTracer } from "@/utils";
import { CORS_HEADERS } from "@/constants";

export async function handleChatRequest(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as {
			message?: string;
			sessionId?: string;
		};

		const userMessage = body.message?.trim();
		if (!userMessage) {
			return new Response(JSON.stringify({ error: "No user message" }), {
				status: 400,
				headers: { "content-type": "application/json", ...CORS_HEADERS },
			});
		}

		const sessionId = body.sessionId ?? crypto.randomUUID();
		const kvHistory = new KVChatHistory(env.KV_SESSIONS, sessionId);

		// Load prior messages and append the new user turn
		const priorMessages = await kvHistory.getMessages();
		const messages = [
			...priorMessages.map((m) => ({
				role: m._getType() === "human" ? ("user" as const) : ("assistant" as const),
				content: m.content as string,
			})),
			{ role: "user" as const, content: userMessage },
		];

		// Invoke the RAG agent with the full conversation
		const agent = createRAGAgent(env);
		const tracer = makeTracer(env);
		const result = await agent.invoke(
			{ messages },
			tracer ? { callbacks: [tracer] } : undefined,
		);

		// Extract the last AI message from the result
		const lastMsg = result.messages[result.messages.length - 1];
		let answer: string;
		if (typeof lastMsg.content === "string") {
			answer = lastMsg.content;
		} else if (Array.isArray(lastMsg.content)) {
			answer = lastMsg.content
				.map((b) => (typeof b === "object" && b !== null && "text" in b ? (b as { text: string }).text : ""))
				.join("");
		} else {
			answer = "";
		}

		// Persist the full updated history in a single KV write
		await kvHistory.saveMessages([
			...priorMessages,
			new HumanMessage(userMessage),
			new AIMessage(answer),
		]);

		return new Response(JSON.stringify({ text: answer, sessionId }), {
			headers: { "content-type": "application/json", ...CORS_HEADERS },
		});
	} catch (error) {
		console.error("Chat error:", error);
		return new Response(JSON.stringify({ error: "Failed to process request" }), {
			status: 500,
			headers: { "content-type": "application/json", ...CORS_HEADERS },
		});
	}
}

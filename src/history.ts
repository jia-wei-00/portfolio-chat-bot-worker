import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import { BaseMessage, HumanMessage, AIMessage, getBufferString } from "@langchain/core/messages";

const SESSION_TTL_SECONDS = 3600; // 1 hour

interface StoredMessage {
	role: "human" | "ai";
	content: string;
}

export class KVChatHistory extends BaseChatMessageHistory {
	lc_namespace = ["portfolio", "kv_chat_history"];

	constructor(
		private kv: KVNamespace,
		private sessionId: string,
	) {
		super();
	}

	async getMessages(): Promise<BaseMessage[]> {
		const stored = await this.kv.get<StoredMessage[]>(this.sessionId, "json");
		if (!stored) return [];
		return stored.map((m) =>
			m.role === "human" ? new HumanMessage(m.content) : new AIMessage(m.content),
		);
	}

	async addMessage(message: BaseMessage): Promise<void> {
		const current = await this.getMessages();
		await this.saveMessages([...current, message]);
	}

	async addMessages(messages: BaseMessage[]): Promise<void> {
		const current = await this.getMessages();
		await this.saveMessages([...current, ...messages]);
	}

	async addUserMessage(message: string): Promise<void> {
		await this.addMessage(new HumanMessage(message));
	}

	async addAIMessage(message: string): Promise<void> {
		await this.addMessage(new AIMessage(message));
	}

	async clear(): Promise<void> {
		await this.kv.delete(this.sessionId);
	}

	private async saveMessages(messages: BaseMessage[]): Promise<void> {
		const stored: StoredMessage[] = messages.map((m) => ({
			role: m._getType() === "human" ? "human" : "ai",
			content: m.content as string,
		}));
		await this.kv.put(this.sessionId, JSON.stringify(stored), {
			expirationTtl: SESSION_TTL_SECONDS,
		});
	}
}

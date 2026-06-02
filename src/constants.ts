export const GEMINI_BASE_URL =
	"https://generativelanguage.googleapis.com/v1beta/openai/";

export const CHAT_MODEL = "gemini-3.1-flash-lite";

// Gemini Embedding 2 — outputs 768-dimensional vectors
export const EMBEDDING_MODEL = "gemini-embedding-2";

export const TOP_K = 5;
export const MATCH_THRESHOLD = 0.5;

export const PORTFOLIO_SYSTEM_PROMPT = `You are a helpful AI assistant on a personal portfolio website.
Answer questions about the portfolio owner based solely on the context provided below.
Be friendly, concise, and professional. If something is not covered in the context, say you don't have that information and suggest the visitor reach out directly.

Portfolio context:
{context}`;

export const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
};

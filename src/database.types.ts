/**
 * Type-safe schema for Supabase queries.
 * Mirrors the SQL in README.md → "Supabase Setup".
 *
 * To regenerate from the live database:
 *   supabase gen types typescript --project-id <ref> > src/database.types.ts
 */
export interface Database {
	public: {
		Tables: {
			portfolio_documents: {
				Row: {
					id: string;
					content: string;
					embedding: number[];
					category: string | null;
					title: string | null;
					created_at: string;
				};
				Insert: {
					id: string;
					content: string;
					embedding: number[];
					category?: string | null;
					title?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					content?: string;
					embedding?: number[];
					category?: string | null;
					title?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: {
			match_portfolio_documents: {
				Args: {
					query_embedding: number[];
					match_count?: number;
					match_threshold?: number;
				};
				Returns: Array<{
					id: string;
					content: string;
					category: string;
					title: string;
					similarity: number;
				}>;
			};
		};
	};
}

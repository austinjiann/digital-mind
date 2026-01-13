import { supabase } from "../db/client";
import { embedQuery } from "./embeddings";

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  score: number;
  filename: string;
}

export async function retrieve(
  query: string,
  topK = 5
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query);

  // Convert to string format for PostgreSQL vector casting
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embeddingStr,
    match_threshold: 0.2,
    match_count: topK,
  });

  if (error) {
    console.error("Retrieval error:", error);
    throw error;
  }

  const results = data || [];
  console.log("Retrieved:", results.length, "chunks");

  return results;
}

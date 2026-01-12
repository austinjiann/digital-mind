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
  const embedding = await embedQuery(query);

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: topK,
  });

  if (error) throw error;

  return data || [];
}

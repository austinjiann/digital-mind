export interface Document {
  id: string;
  filename: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: "pending" | "processing" | "ready" | "error";
  error_message?: string;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface Chunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  token_count: number;
  metadata: Record<string, unknown>;
}

export interface RetrievedChunk extends Chunk {
  score: number;
  filename: string;
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  audio_url?: string;
  sources?: string[]; // Chunk IDs
  latency_ms?: {
    stt?: number;
    retrieval: number;
    llm: number;
    tts?: number;
  };
  created_at: string;
}

export type ConversationState = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING";

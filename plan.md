# Digital Mind: 3-Day Implementation Plan

## Project Overview

You're building a personal AI assistant that:
- Knows everything about you (RAG over your documents)
- Speaks in your cloned voice (XTTS on Modal)
- Listens to you (Deepgram STT)
- Feels like a real conversation (interruption handling, low latency)

---

## Tech Stack (Final)

| Layer | Technology | Why |
|-------|------------|-----|
| Frontend | Next.js 14 + TypeScript | App router, server components, fast |
| UI | Radix UI + Tailwind | Accessible, unstyled primitives |
| Real-time | WebSocket (native) | Bun has excellent WS support |
| Audio Capture | MediaRecorder API | Browser-native, good codec support |
| Audio Playback | Web Audio API + AudioWorklet | Gapless streaming playback |
| Backend | Bun + Hono | Fast, TypeScript-native, great DX |
| Database | Supabase (Postgres + pgvector) | Managed, vector search built-in |
| Storage | Supabase Storage | Simple, integrated with auth |
| STT | Deepgram Nova-2 | Streaming, ~200ms latency |
| LLM | OpenAI GPT-4o | Your credits, fast streaming |
| TTS | XTTS v2 on Modal | Voice cloning, keep_warm |
| Embeddings | OpenAI text-embedding-3-small | Cheap, good quality |

---

## Repository Structure

```
digital-mind/
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── page.tsx        # Main chat interface
│   │   │   ├── docs/
│   │   │   │   └── page.tsx    # Document management
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── chat/
│   │   │   │   ├── chat-container.tsx
│   │   │   │   ├── message-list.tsx
│   │   │   │   ├── voice-button.tsx
│   │   │   │   └── sources-panel.tsx
│   │   │   ├── docs/
│   │   │   │   ├── upload-zone.tsx
│   │   │   │   └── doc-list.tsx
│   │   │   └── debug/
│   │   │       └── latency-hud.tsx
│   │   ├── lib/
│   │   │   ├── websocket.ts    # WS client wrapper
│   │   │   ├── audio-player.ts # Streaming audio playback
│   │   │   ├── audio-recorder.ts # Mic capture
│   │   │   └── utils.ts
│   │   └── package.json
│   │
│   ├── api/                    # Bun + Hono HTTP API
│   │   ├── src/
│   │   │   ├── index.ts        # Hono app entry
│   │   │   ├── routes/
│   │   │   │   ├── docs.ts     # Document upload/list
│   │   │   │   └── health.ts
│   │   │   ├── services/
│   │   │   │   ├── storage.ts  # Supabase storage
│   │   │   │   ├── embeddings.ts
│   │   │   │   └── chunks.ts   # Text chunking logic
│   │   │   └── db/
│   │   │       └── client.ts   # Supabase client
│   │   └── package.json
│   │
│   └── agent/                  # Bun WebSocket server
│       ├── src/
│       │   ├── index.ts        # WS server entry
│       │   ├── connection.ts   # Per-connection handler
│       │   ├── state-machine.ts # Conversation states
│       │   ├── services/
│       │   │   ├── retrieval.ts # RAG logic
│       │   │   ├── llm.ts      # OpenAI streaming
│       │   │   ├── stt.ts      # Deepgram client
│       │   │   └── tts.ts      # Modal XTTS client
│       │   └── protocol/
│       │       └── events.ts   # Typed WS events
│       └── package.json
│
├── services/
│   └── tts/                    # Modal XTTS service
│       ├── app.py              # Modal app definition
│       ├── inference.py        # XTTS streaming logic
│       └── requirements.txt
│
├── packages/
│   └── shared/                 # Shared types + schemas
│       ├── src/
│       │   ├── events.ts       # WebSocket event types
│       │   ├── schemas.ts      # Zod schemas
│       │   └── types.ts        # Common types
│       └── package.json
│
├── scripts/
│   ├── setup-db.sql            # Supabase schema
│   └── process-voice.sh        # Voice dataset prep
│
├── voice-data/                 # Your voice recordings
│   ├── raw/                    # Original recordings
│   ├── processed/              # Cleaned clips
│   └── manifest.json           # Clip metadata
│
├── bunfig.toml
├── package.json                # Workspace root
└── README.md
```

---

## Database Schema

```sql
-- Run this in Supabase SQL editor

-- Enable pgvector
create extension if not exists vector;

-- Documents table
create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  mime_type text not null,
  size_bytes integer not null,
  status text not null default 'pending', -- pending, processing, ready, error
  error_message text,
  chunk_count integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Chunks table (the actual RAG content)
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  content text not null,
  chunk_index integer not null,
  chunk_hash text not null, -- For deduplication
  token_count integer not null,
  embedding vector(1536), -- text-embedding-3-small dimension
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

-- Vector similarity search index
create index chunks_embedding_idx on chunks 
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

-- Full-text search (optional but useful)
alter table chunks add column fts tsvector 
generated always as (to_tsvector('english', content)) stored;
create index chunks_fts_idx on chunks using gin(fts);

-- Conversations table (optional, for history)
create table conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  role text not null, -- 'user' or 'assistant'
  content text not null,
  audio_url text, -- If message was spoken
  sources jsonb, -- Chunk IDs used for this response
  latency_ms jsonb, -- {stt, retrieval, llm, tts}
  created_at timestamptz default now()
);
```

---

## WebSocket Protocol

All messages are JSON with a `type` field.

### Client → Server

```typescript
// User sends text message
{
  type: "user.text",
  content: string,
  conversation_id?: string
}

// User sends audio chunk (while recording)
{
  type: "user.audio_chunk",
  audio: string // base64 PCM or webm
}

// User finished speaking
{
  type: "user.audio_end"
}

// User interrupts (clicked stop, or started speaking while agent talks)
{
  type: "user.interrupt"
}

// User requests voice-only or text-only mode
{
  type: "user.set_mode",
  mode: "voice" | "text" | "both"
}
```

### Server → Client

```typescript
// Agent is thinking (retrieval + LLM started)
{
  type: "agent.thinking"
}

// Transcription result from user speech
{
  type: "agent.transcript",
  content: string,
  is_final: boolean
}

// LLM token stream
{
  type: "agent.token",
  token: string,
  accumulated: string // Full response so far
}

// Sources used for response
{
  type: "agent.sources",
  sources: Array<{
    chunk_id: string,
    document_id: string,
    filename: string,
    excerpt: string,
    score: number
  }>
}

// Audio chunk ready to play
{
  type: "agent.audio_chunk",
  audio: string, // base64 PCM 24kHz mono
  chunk_index: number,
  is_last: boolean
}

// Agent finished speaking
{
  type: "agent.done",
  latency: {
    stt_ms?: number,
    retrieval_ms: number,
    llm_first_token_ms: number,
    llm_total_ms: number,
    tts_first_chunk_ms: number,
    tts_total_ms: number,
    total_ms: number
  }
}

// Error occurred
{
  type: "agent.error",
  error: string,
  recoverable: boolean
}
```

---

## Conversation State Machine

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
┌──────────┐   user input   ┌──────────────┐         │
│   IDLE   │ ─────────────▶ │   LISTENING  │         │
└──────────┘                └──────────────┘         │
     ▲                            │                  │
     │                     audio_end / text          │
     │                            │                  │
     │                            ▼                  │
     │                     ┌──────────────┐          │
     │                     │  PROCESSING  │          │ interrupt
     │                     │  (STT→RAG→   │          │
     │                     │   LLM)       │          │
     │                     └──────────────┘          │
     │                            │                  │
     │                     first audio chunk         │
     │                            │                  │
     │                            ▼                  │
     │                     ┌──────────────┐          │
     │      audio done     │   SPEAKING   │ ─────────┘
     └─────────────────────│  (streaming  │
                           │   audio)     │
                           └──────────────┘

INTERRUPT RULES:
- From SPEAKING: Stop audio, cancel TTS, go to PROCESSING with new input
- From PROCESSING: Cancel LLM stream, restart with new input
- From LISTENING: Replace current input buffer
```

---

## Day 1: Foundation + RAG (Text Only)

**Goal:** Text chat that knows about your documents. No voice yet.

### Phase 1.1: Project Setup (1 hour)

```bash
# Create workspace
mkdir digital-mind && cd digital-mind
bun init -y

# Setup workspaces in package.json
{
  "name": "digital-mind",
  "workspaces": ["apps/*", "packages/*", "services/*"]
}

# Create all directories
mkdir -p apps/{web,api,agent} packages/shared services/tts scripts voice-data/{raw,processed}

# Initialize each package
cd apps/web && bunx create-next-app@latest . --typescript --tailwind --app --src-dir=false
cd ../api && bun init -y
cd ../agent && bun init -y
cd ../../packages/shared && bun init -y

# Install shared dependencies
cd ../..
bun add -d typescript @types/bun
```

### Phase 1.2: Shared Types (30 min)

```typescript
// packages/shared/src/events.ts
import { z } from "zod";

// Client events
export const UserTextEvent = z.object({
  type: z.literal("user.text"),
  content: z.string().min(1),
  conversation_id: z.string().uuid().optional(),
});

export const UserInterruptEvent = z.object({
  type: z.literal("user.interrupt"),
});

export const UserAudioChunkEvent = z.object({
  type: z.literal("user.audio_chunk"),
  audio: z.string(), // base64
});

export const UserAudioEndEvent = z.object({
  type: z.literal("user.audio_end"),
});

export const ClientEvent = z.discriminatedUnion("type", [
  UserTextEvent,
  UserInterruptEvent,
  UserAudioChunkEvent,
  UserAudioEndEvent,
]);

export type ClientEvent = z.infer<typeof ClientEvent>;

// Server events
export const AgentTokenEvent = z.object({
  type: z.literal("agent.token"),
  token: z.string(),
  accumulated: z.string(),
});

export const AgentSourcesEvent = z.object({
  type: z.literal("agent.sources"),
  sources: z.array(z.object({
    chunk_id: z.string(),
    document_id: z.string(),
    filename: z.string(),
    excerpt: z.string(),
    score: z.number(),
  })),
});

export const AgentAudioChunkEvent = z.object({
  type: z.literal("agent.audio_chunk"),
  audio: z.string(),
  chunk_index: z.number(),
  is_last: z.boolean(),
});

export const AgentDoneEvent = z.object({
  type: z.literal("agent.done"),
  latency: z.object({
    stt_ms: z.number().optional(),
    retrieval_ms: z.number(),
    llm_first_token_ms: z.number(),
    llm_total_ms: z.number(),
    tts_first_chunk_ms: z.number().optional(),
    tts_total_ms: z.number().optional(),
    total_ms: z.number(),
  }),
});

export const AgentErrorEvent = z.object({
  type: z.literal("agent.error"),
  error: z.string(),
  recoverable: z.boolean(),
});

export type ServerEvent = 
  | z.infer<typeof AgentTokenEvent>
  | z.infer<typeof AgentSourcesEvent>
  | z.infer<typeof AgentAudioChunkEvent>
  | z.infer<typeof AgentDoneEvent>
  | z.infer<typeof AgentErrorEvent>;
```

```typescript
// packages/shared/src/types.ts
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
```

### Phase 1.3: Supabase Setup (30 min)

1. Create project at supabase.com
2. Run the SQL schema from above
3. Get your keys:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`

```typescript
// apps/api/src/db/client.ts
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
```

### Phase 1.4: Document Upload API (1.5 hours)

```typescript
// apps/api/src/index.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { docs } from "./routes/docs";

const app = new Hono();

app.use("*", cors());
app.route("/docs", docs);

app.get("/health", (c) => c.json({ status: "ok" }));

export default {
  port: 3001,
  fetch: app.fetch,
};
```

```typescript
// apps/api/src/routes/docs.ts
import { Hono } from "hono";
import { supabase } from "../db/client";
import { processDocument } from "../services/processor";

const docs = new Hono();

// Upload document
docs.post("/upload", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  
  if (!file) {
    return c.json({ error: "No file provided" }, 400);
  }

  // Upload to Supabase Storage
  const storagePath = `documents/${Date.now()}-${file.name}`;
  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file);

  if (uploadError) {
    return c.json({ error: uploadError.message }, 500);
  }

  // Create document record
  const { data: doc, error: dbError } = await supabase
    .from("documents")
    .insert({
      filename: file.name,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      status: "pending",
    })
    .select()
    .single();

  if (dbError) {
    return c.json({ error: dbError.message }, 500);
  }

  // Process async (in real app, use a job queue)
  processDocument(doc.id).catch(console.error);

  return c.json({ document: doc });
});

// List documents
docs.get("/", async (c) => {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ documents: data });
});

// Get document chunks
docs.get("/:id/chunks", async (c) => {
  const { data, error } = await supabase
    .from("chunks")
    .select("*")
    .eq("document_id", c.req.param("id"))
    .order("chunk_index");

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ chunks: data });
});

export { docs };
```

### Phase 1.5: Document Processing + Embeddings (2 hours)

```typescript
// apps/api/src/services/processor.ts
import { supabase } from "../db/client";
import { chunkText } from "./chunker";
import { embedTexts } from "./embeddings";
import { createHash } from "crypto";

export async function processDocument(documentId: string) {
  try {
    // Update status
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // Get document
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    // Download file
    const { data: fileData } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);

    const text = await fileData!.text();

    // Chunk the text
    const chunks = chunkText(text, {
      maxTokens: 512,
      overlap: 50,
    });

    // Generate embeddings (batch)
    const embeddings = await embedTexts(chunks.map((c) => c.content));

    // Insert chunks with embeddings
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: documentId,
      content: chunk.content,
      chunk_index: i,
      chunk_hash: createHash("sha256").update(chunk.content).digest("hex"),
      token_count: chunk.tokenCount,
      embedding: embeddings[i],
      metadata: chunk.metadata,
    }));

    await supabase.from("chunks").insert(chunkRows);

    // Update document status
    await supabase
      .from("documents")
      .update({ 
        status: "ready", 
        chunk_count: chunks.length 
      })
      .eq("id", documentId);

  } catch (error) {
    console.error("Processing error:", error);
    await supabase
      .from("documents")
      .update({ 
        status: "error", 
        error_message: String(error) 
      })
      .eq("id", documentId);
  }
}
```

```typescript
// apps/api/src/services/chunker.ts
import { encode } from "gpt-tokenizer"; // or tiktoken

interface ChunkOptions {
  maxTokens: number;
  overlap: number;
}

interface Chunk {
  content: string;
  tokenCount: number;
  metadata: {
    startChar: number;
    endChar: number;
  };
}

export function chunkText(text: string, options: ChunkOptions): Chunk[] {
  const { maxTokens, overlap } = options;
  const chunks: Chunk[] = [];
  
  // Split into paragraphs first
  const paragraphs = text.split(/\n\n+/);
  
  let currentChunk = "";
  let currentTokens = 0;
  let startChar = 0;

  for (const para of paragraphs) {
    const paraTokens = encode(para).length;
    
    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      // Save current chunk
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens,
        metadata: {
          startChar,
          endChar: startChar + currentChunk.length,
        },
      });

      // Start new chunk with overlap
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(words.length * 0.1));
      currentChunk = overlapWords.join(" ") + "\n\n" + para;
      currentTokens = encode(currentChunk).length;
      startChar = startChar + currentChunk.length - overlapWords.join(" ").length;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + para;
      currentTokens += paraTokens;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: currentTokens,
      metadata: {
        startChar,
        endChar: startChar + currentChunk.length,
      },
    });
  }

  return chunks;
}
```

```typescript
// apps/api/src/services/embeddings.ts
import OpenAI from "openai";

const openai = new OpenAI();

export async function embedTexts(texts: string[]): Promise<number[][]> {
  // Batch in groups of 100 (API limit)
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}

export async function embedQuery(query: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  return response.data[0].embedding;
}
```

### Phase 1.6: Agent WebSocket Server (2 hours)

```typescript
// apps/agent/src/index.ts
import { handleConnection } from "./connection";

const server = Bun.serve({
  port: 3002,
  fetch(req, server) {
    // Upgrade to WebSocket
    if (server.upgrade(req)) {
      return;
    }
    return new Response("WebSocket server", { status: 200 });
  },
  websocket: {
    open(ws) {
      console.log("Client connected");
      ws.data = { state: "IDLE" };
    },
    message(ws, message) {
      handleConnection(ws, message);
    },
    close(ws) {
      console.log("Client disconnected");
    },
  },
});

console.log(`Agent running on ws://localhost:${server.port}`);
```

```typescript
// apps/agent/src/connection.ts
import { ClientEvent } from "@digital-mind/shared";
import { retrieve } from "./services/retrieval";
import { streamLLM } from "./services/llm";

type State = "IDLE" | "LISTENING" | "PROCESSING" | "SPEAKING";

interface ConnectionData {
  state: State;
  abortController?: AbortController;
}

export async function handleConnection(ws: any, rawMessage: string | Buffer) {
  const data = ws.data as ConnectionData;
  
  try {
    const message = JSON.parse(rawMessage.toString());
    const event = ClientEvent.parse(message);

    switch (event.type) {
      case "user.text":
        await handleUserText(ws, data, event.content);
        break;
      
      case "user.interrupt":
        handleInterrupt(ws, data);
        break;

      // Audio events handled in Day 2
    }
  } catch (error) {
    ws.send(JSON.stringify({
      type: "agent.error",
      error: String(error),
      recoverable: true,
    }));
  }
}

async function handleUserText(ws: any, data: ConnectionData, content: string) {
  // Cancel any ongoing response
  if (data.abortController) {
    data.abortController.abort();
  }

  data.state = "PROCESSING";
  data.abortController = new AbortController();
  const startTime = Date.now();

  try {
    // 1. Retrieve relevant chunks
    ws.send(JSON.stringify({ type: "agent.thinking" }));
    
    const retrievalStart = Date.now();
    const sources = await retrieve(content);
    const retrievalMs = Date.now() - retrievalStart;

    // Send sources
    ws.send(JSON.stringify({
      type: "agent.sources",
      sources: sources.map((s) => ({
        chunk_id: s.id,
        document_id: s.document_id,
        filename: s.filename,
        excerpt: s.content.slice(0, 200) + "...",
        score: s.score,
      })),
    }));

    // 2. Stream LLM response
    const llmStart = Date.now();
    let firstTokenTime: number | null = null;
    let accumulated = "";

    const systemPrompt = buildSystemPrompt(sources);
    
    for await (const token of streamLLM(systemPrompt, content, data.abortController.signal)) {
      if (!firstTokenTime) {
        firstTokenTime = Date.now();
      }
      
      accumulated += token;
      
      ws.send(JSON.stringify({
        type: "agent.token",
        token,
        accumulated,
      }));
    }

    const llmTotalMs = Date.now() - llmStart;

    // 3. Done (no TTS yet)
    data.state = "IDLE";
    
    ws.send(JSON.stringify({
      type: "agent.done",
      latency: {
        retrieval_ms: retrievalMs,
        llm_first_token_ms: firstTokenTime ? firstTokenTime - llmStart : 0,
        llm_total_ms: llmTotalMs,
        total_ms: Date.now() - startTime,
      },
    }));

  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return; // Interrupted, don't send error
    }
    throw error;
  }
}

function handleInterrupt(ws: any, data: ConnectionData) {
  if (data.abortController) {
    data.abortController.abort();
  }
  data.state = "IDLE";
  ws.send(JSON.stringify({ type: "agent.interrupted" }));
}

function buildSystemPrompt(sources: any[]): string {
  const context = sources
    .map((s, i) => `[Source ${i + 1}]: ${s.content}`)
    .join("\n\n");

  return `You are a digital version of the user. You have access to their personal documents and knowledge.

Answer questions as if you ARE the user, using first person ("I", "my", etc).

Use the following context from the user's documents to inform your answers:

${context}

Important:
- If the context doesn't contain relevant information, say so honestly
- Speak naturally and conversationally
- Keep responses concise unless asked for detail
- Reference specific details from the documents when relevant`;
}
```

```typescript
// apps/agent/src/services/retrieval.ts
import { createClient } from "@supabase/supabase-js";
import { embedQuery } from "./embeddings";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export interface RetrievedChunk {
  id: string;
  document_id: string;
  content: string;
  score: number;
  filename: string;
}

export async function retrieve(query: string, topK = 5): Promise<RetrievedChunk[]> {
  const embedding = await embedQuery(query);

  // Vector similarity search
  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: topK,
  });

  if (error) throw error;

  return data;
}
```

You'll need this Postgres function:

```sql
-- Add to your Supabase SQL
create or replace function match_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  score float,
  filename text
)
language sql stable
as $$
  select 
    chunks.id,
    chunks.document_id,
    chunks.content,
    1 - (chunks.embedding <=> query_embedding) as score,
    documents.filename
  from chunks
  join documents on documents.id = chunks.document_id
  where 1 - (chunks.embedding <=> query_embedding) > match_threshold
  order by chunks.embedding <=> query_embedding
  limit match_count;
$$;
```

```typescript
// apps/agent/src/services/llm.ts
import OpenAI from "openai";

const openai = new OpenAI();

export async function* streamLLM(
  systemPrompt: string,
  userMessage: string,
  signal: AbortSignal
): AsyncGenerator<string> {
  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: true,
  });

  for await (const chunk of stream) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    
    const token = chunk.choices[0]?.delta?.content;
    if (token) {
      yield token;
    }
  }
}
```

### Phase 1.7: Basic Frontend (2 hours)

```typescript
// apps/web/lib/websocket.ts
import type { ServerEvent, ClientEvent } from "@digital-mind/shared";

type EventHandler = (event: ServerEvent) => void;

export class AgentConnection {
  private ws: WebSocket | null = null;
  private handlers: Set<EventHandler> = new Set();
  private reconnectAttempts = 0;
  private maxReconnects = 5;

  constructor(private url: string) {}

  connect() {
    this.ws = new WebSocket(this.url);
    
    this.ws.onopen = () => {
      console.log("Connected to agent");
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (e) => {
      const event = JSON.parse(e.data) as ServerEvent;
      this.handlers.forEach((h) => h(event));
    };

    this.ws.onclose = () => {
      if (this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
      }
    };
  }

  send(event: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  subscribe(handler: EventHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect() {
    this.ws?.close();
  }
}
```

```tsx
// apps/web/app/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { AgentConnection } from "@/lib/websocket";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    chunk_id: string;
    filename: string;
    excerpt: string;
  }>;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [latency, setLatency] = useState<Record<string, number>>({});
  
  const connectionRef = useRef<AgentConnection | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const conn = new AgentConnection("ws://localhost:3002");
    connectionRef.current = conn;
    
    conn.subscribe((event) => {
      switch (event.type) {
        case "agent.thinking":
          setIsProcessing(true);
          currentMessageIdRef.current = crypto.randomUUID();
          break;

        case "agent.token":
          setCurrentResponse(event.accumulated);
          break;

        case "agent.sources":
          // Store sources for the current message
          break;

        case "agent.done":
          // Finalize message
          if (currentMessageIdRef.current) {
            setMessages((prev) => [
              ...prev,
              {
                id: currentMessageIdRef.current!,
                role: "assistant",
                content: currentResponse,
              },
            ]);
          }
          setCurrentResponse("");
          setIsProcessing(false);
          setLatency(event.latency);
          break;

        case "agent.error":
          console.error(event.error);
          setIsProcessing(false);
          break;
      }
    });

    conn.connect();
    return () => conn.disconnect();
  }, []);

  const sendMessage = () => {
    if (!input.trim() || isProcessing) return;

    // Add user message
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: input },
    ]);

    // Send to agent
    connectionRef.current?.send({
      type: "user.text",
      content: input,
    });

    setInput("");
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      {/* Latency HUD */}
      <div className="text-xs text-gray-500 mb-4 font-mono">
        {Object.entries(latency).map(([key, value]) => (
          <span key={key} className="mr-4">
            {key}: {value}ms
          </span>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-4 rounded-lg ${
              msg.role === "user"
                ? "bg-blue-100 ml-12"
                : "bg-gray-100 mr-12"
            }`}
          >
            {msg.content}
          </div>
        ))}

        {/* Streaming response */}
        {currentResponse && (
          <div className="p-4 rounded-lg bg-gray-100 mr-12">
            {currentResponse}
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2 mt-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Ask me anything..."
          className="flex-1 p-3 border rounded-lg"
          disabled={isProcessing}
        />
        <button
          onClick={sendMessage}
          disabled={isProcessing}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

### Day 1 Checklist

- [ ] Repo structure created
- [ ] Supabase project + schema ready
- [ ] Document upload working
- [ ] Chunking + embedding working
- [ ] Vector search returning results
- [ ] Agent WebSocket streaming LLM responses
- [ ] Basic chat UI showing streamed text
- [ ] Latency HUD displaying timings
- [ ] Upload 2-3 documents about yourself to test

---

## Day 2: Voice Output (TTS)

**Goal:** Agent speaks responses in your cloned voice.

### Phase 2.1: Record Your Voice Dataset (1 hour)

Do this while other things run/deploy.

**Recording Tips:**
- Quiet room, no echo
- Consistent mic distance (6-8 inches)
- Read varied content: questions, statements, emotions
- Aim for 30-45 minutes total
- Include natural pauses, varied pacing

**What to read:**
- Wikipedia articles (factual, varied topics)
- Fiction passages (emotional range)
- Questions and answers (conversational)
- Your own writing if you have any

**Processing:**

```bash
# scripts/process-voice.sh

#!/bin/bash
# Requires: ffmpeg, sox

INPUT_DIR="voice-data/raw"
OUTPUT_DIR="voice-data/processed"

mkdir -p "$OUTPUT_DIR"

# Process each file
for file in "$INPUT_DIR"/*.{wav,mp3,m4a}; do
  [ -e "$file" ] || continue
  
  basename=$(basename "$file" | sed 's/\.[^.]*$//')
  
  # Normalize, convert to 24kHz mono, remove silence
  ffmpeg -i "$file" \
    -af "silenceremove=1:0:-50dB,loudnorm,highpass=f=80,lowpass=f=8000" \
    -ar 24000 -ac 1 \
    "$OUTPUT_DIR/${basename}.wav"
done

echo "Processed $(ls -1 "$OUTPUT_DIR"/*.wav | wc -l) files"
```

**Split into clips (3-12 seconds each):**

```python
# scripts/split_audio.py
import os
from pydub import AudioSegment
from pydub.silence import split_on_silence
import json

input_dir = "voice-data/processed"
output_dir = "voice-data/clips"
os.makedirs(output_dir, exist_ok=True)

manifest = []

for filename in os.listdir(input_dir):
    if not filename.endswith(".wav"):
        continue
    
    audio = AudioSegment.from_wav(f"{input_dir}/{filename}")
    
    # Split on silence
    chunks = split_on_silence(
        audio,
        min_silence_len=500,
        silence_thresh=-40,
        keep_silence=200
    )
    
    for i, chunk in enumerate(chunks):
        # Skip too short or too long
        duration = len(chunk) / 1000
        if duration < 3 or duration > 12:
            continue
        
        clip_name = f"{filename[:-4]}_clip_{i:03d}.wav"
        chunk.export(f"{output_dir}/{clip_name}", format="wav")
        
        manifest.append({
            "path": clip_name,
            "duration": duration,
            "text": ""  # You'll fill this in
        })

with open("voice-data/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print(f"Created {len(manifest)} clips")
```

**Transcribe clips** (for XTTS training):

```python
# scripts/transcribe_clips.py
import whisper
import json

model = whisper.load_model("base")

with open("voice-data/manifest.json") as f:
    manifest = json.load(f)

for item in manifest:
    result = model.transcribe(f"voice-data/clips/{item['path']}")
    item["text"] = result["text"].strip()

with open("voice-data/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)
```

### Phase 2.2: Modal XTTS Service (2 hours)

```python
# services/tts/app.py
import modal
import io
import base64

# Define the Modal image with XTTS dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg")
    .pip_install(
        "TTS==0.21.1",
        "torch>=2.1",
        "torchaudio",
        "numpy<2",
    )
)

app = modal.App("digital-mind-tts", image=image)

# Volume for storing voice profiles
voice_volume = modal.Volume.from_name("voice-profiles", create_if_missing=True)


@app.cls(
    gpu="A10G",
    container_idle_timeout=300,  # Keep warm for 5 min
    volumes={"/voices": voice_volume},
)
class TTSService:
    @modal.enter()
    def load_model(self):
        """Load XTTS model on container start."""
        from TTS.tts.configs.xtts_config import XttsConfig
        from TTS.tts.models.xtts import Xtts
        import torch

        print("Loading XTTS model...")
        
        config = XttsConfig()
        config.load_json("/root/.local/share/tts/tts_models--multilingual--multi-dataset--xtts_v2/config.json")
        
        self.model = Xtts.init_from_config(config)
        self.model.load_checkpoint(
            config,
            checkpoint_dir="/root/.local/share/tts/tts_models--multilingual--multi-dataset--xtts_v2/",
        )
        self.model.cuda()
        
        self.speaker_embeddings = {}
        print("Model loaded!")

    @modal.method()
    def create_voice(self, voice_id: str, audio_clips: list[bytes]) -> dict:
        """Create a voice profile from audio clips."""
        import tempfile
        import os

        # Save clips temporarily
        temp_paths = []
        for i, clip in enumerate(audio_clips):
            path = f"/tmp/clip_{i}.wav"
            with open(path, "wb") as f:
                f.write(clip)
            temp_paths.append(path)

        # Compute speaker embedding
        gpt_cond_latent, speaker_embedding = self.model.get_conditioning_latents(
            audio_path=temp_paths
        )

        # Save to volume
        import torch
        torch.save({
            "gpt_cond_latent": gpt_cond_latent,
            "speaker_embedding": speaker_embedding,
        }, f"/voices/{voice_id}.pt")
        
        voice_volume.commit()

        # Cache in memory
        self.speaker_embeddings[voice_id] = (gpt_cond_latent, speaker_embedding)

        # Cleanup
        for path in temp_paths:
            os.remove(path)

        return {"voice_id": voice_id, "status": "created"}

    @modal.method()
    def synthesize(self, text: str, voice_id: str = "default") -> bytes:
        """Synthesize full audio for text."""
        import torch
        import torchaudio
        
        # Load voice if not cached
        if voice_id not in self.speaker_embeddings:
            data = torch.load(f"/voices/{voice_id}.pt")
            self.speaker_embeddings[voice_id] = (
                data["gpt_cond_latent"],
                data["speaker_embedding"],
            )

        gpt_cond_latent, speaker_embedding = self.speaker_embeddings[voice_id]

        # Generate audio
        out = self.model.inference(
            text,
            "en",
            gpt_cond_latent,
            speaker_embedding,
            temperature=0.7,
        )

        # Convert to bytes
        audio_tensor = torch.tensor(out["wav"]).unsqueeze(0)
        buffer = io.BytesIO()
        torchaudio.save(buffer, audio_tensor, 24000, format="wav")
        
        return buffer.getvalue()

    @modal.method()
    def synthesize_streaming(self, text: str, voice_id: str = "default"):
        """
        Stream audio chunks as they're generated.
        Yields base64-encoded audio chunks.
        """
        import torch
        import torchaudio

        if voice_id not in self.speaker_embeddings:
            data = torch.load(f"/voices/{voice_id}.pt")
            self.speaker_embeddings[voice_id] = (
                data["gpt_cond_latent"],
                data["speaker_embedding"],
            )

        gpt_cond_latent, speaker_embedding = self.speaker_embeddings[voice_id]

        # Use streaming inference
        chunks = self.model.inference_stream(
            text,
            "en",
            gpt_cond_latent,
            speaker_embedding,
            temperature=0.7,
            stream_chunk_size=20,  # Smaller = faster first chunk
        )

        for i, chunk in enumerate(chunks):
            # Convert chunk to WAV bytes
            audio_tensor = torch.tensor(chunk).unsqueeze(0)
            buffer = io.BytesIO()
            torchaudio.save(buffer, audio_tensor, 24000, format="wav")
            
            yield {
                "chunk_index": i,
                "audio": base64.b64encode(buffer.getvalue()).decode(),
            }


@app.function()
def warmup():
    """Pre-download the model."""
    from TTS.api import TTS
    TTS("tts_models/multilingual/multi-dataset/xtts_v2")


# Keep one instance warm
@app.function(schedule=modal.Period(minutes=4))
def keep_alive():
    """Ping to prevent cold starts."""
    TTSService().synthesize.remote("Hello", "default")
```

**Deploy:**

```bash
cd services/tts
modal deploy app.py
```

**Create your voice profile:**

```python
# scripts/create_voice.py
import modal
from pathlib import Path

# Load clips
clips_dir = Path("voice-data/clips")
clips = []
for clip_path in sorted(clips_dir.glob("*.wav"))[:10]:  # Use 10 best clips
    clips.append(clip_path.read_bytes())

# Create voice on Modal
TTSService = modal.Cls.lookup("digital-mind-tts", "TTSService")
result = TTSService().create_voice.remote("my-voice", clips)
print(result)
```

### Phase 2.3: Text Chunking for Low Latency (1 hour)

The key insight: don't wait for the full LLM response before starting TTS.

```typescript
// apps/agent/src/services/text-chunker.ts

/**
 * Splits streaming text into speakable segments.
 * Goal: Get first audio chunk ASAP while maintaining natural speech.
 */
export class SpeechChunker {
  private buffer = "";
  private minChunkLength = 50;  // Minimum chars before emitting
  private sentenceEnders = /[.!?]/;
  private clauseEnders = /[,;:—]/;

  /**
   * Add tokens and get any complete chunks.
   */
  addToken(token: string): string | null {
    this.buffer += token;

    // Check for sentence boundary
    const sentenceMatch = this.buffer.match(/^(.+?[.!?])\s+(.*)$/s);
    if (sentenceMatch && sentenceMatch[1].length >= this.minChunkLength) {
      const chunk = sentenceMatch[1];
      this.buffer = sentenceMatch[2];
      return chunk;
    }

    // Check for clause boundary if buffer is getting long
    if (this.buffer.length > 150) {
      const clauseMatch = this.buffer.match(/^(.+?[,;:—])\s+(.*)$/s);
      if (clauseMatch && clauseMatch[1].length >= this.minChunkLength) {
        const chunk = clauseMatch[1];
        this.buffer = clauseMatch[2];
        return chunk;
      }
    }

    // Force emit if way too long (prevents runaway buffer)
    if (this.buffer.length > 300) {
      // Find last space
      const lastSpace = this.buffer.lastIndexOf(" ", 250);
      if (lastSpace > 100) {
        const chunk = this.buffer.slice(0, lastSpace);
        this.buffer = this.buffer.slice(lastSpace + 1);
        return chunk;
      }
    }

    return null;
  }

  /**
   * Flush remaining buffer at end of response.
   */
  flush(): string | null {
    if (this.buffer.trim()) {
      const chunk = this.buffer.trim();
      this.buffer = "";
      return chunk;
    }
    return null;
  }

  reset() {
    this.buffer = "";
  }
}
```

### Phase 2.4: TTS Integration in Agent (2 hours)

```typescript
// apps/agent/src/services/tts.ts

interface TTSChunk {
  chunk_index: number;
  audio: string; // base64
}

export class TTSClient {
  private baseUrl: string;
  
  constructor() {
    // Modal function URL
    this.baseUrl = process.env.MODAL_TTS_URL!;
  }

  async *streamSpeech(text: string, voiceId = "my-voice"): AsyncGenerator<TTSChunk> {
    const response = await fetch(`${this.baseUrl}/synthesize_streaming`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: voiceId }),
    });

    if (!response.ok) {
      throw new Error(`TTS error: ${response.statusText}`);
    }

    // Modal returns JSONL for generators
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      
      // Parse complete JSON lines
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          yield JSON.parse(line) as TTSChunk;
        }
      }
    }
  }

  async synthesize(text: string, voiceId = "my-voice"): Promise<Buffer> {
    const response = await fetch(`${this.baseUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: voiceId }),
    });

    if (!response.ok) {
      throw new Error(`TTS error: ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
```

**Update connection handler:**

```typescript
// apps/agent/src/connection.ts (updated)

import { SpeechChunker } from "./services/text-chunker";
import { TTSClient } from "./services/tts";

const ttsClient = new TTSClient();

async function handleUserText(ws: any, data: ConnectionData, content: string) {
  if (data.abortController) {
    data.abortController.abort();
  }

  data.state = "PROCESSING";
  data.abortController = new AbortController();
  const startTime = Date.now();
  const chunker = new SpeechChunker();

  let retrievalMs = 0;
  let llmFirstTokenMs = 0;
  let ttsFirstChunkMs: number | null = null;
  
  // Track TTS tasks
  const ttsQueue: Promise<void>[] = [];
  let audioChunkIndex = 0;

  try {
    // 1. Retrieve
    ws.send(JSON.stringify({ type: "agent.thinking" }));
    const retrievalStart = Date.now();
    const sources = await retrieve(content);
    retrievalMs = Date.now() - retrievalStart;

    ws.send(JSON.stringify({
      type: "agent.sources",
      sources: sources.map((s) => ({
        chunk_id: s.id,
        document_id: s.document_id,
        filename: s.filename,
        excerpt: s.content.slice(0, 200) + "...",
        score: s.score,
      })),
    }));

    // 2. Stream LLM + TTS
    const llmStart = Date.now();
    let accumulated = "";

    const systemPrompt = buildSystemPrompt(sources);
    
    const processSpeechChunk = async (text: string) => {
      const ttsStart = ttsFirstChunkMs === null ? Date.now() : null;
      
      for await (const chunk of ttsClient.streamSpeech(text)) {
        if (data.abortController?.signal.aborted) return;
        
        if (ttsStart && ttsFirstChunkMs === null) {
          ttsFirstChunkMs = Date.now() - ttsStart;
        }

        ws.send(JSON.stringify({
          type: "agent.audio_chunk",
          audio: chunk.audio,
          chunk_index: audioChunkIndex++,
          is_last: false,
        }));
      }
    };

    for await (const token of streamLLM(systemPrompt, content, data.abortController.signal)) {
      if (!llmFirstTokenMs) {
        llmFirstTokenMs = Date.now() - llmStart;
      }
      
      accumulated += token;
      
      // Send text token
      ws.send(JSON.stringify({
        type: "agent.token",
        token,
        accumulated,
      }));

      // Check for speakable chunk
      const speechChunk = chunker.addToken(token);
      if (speechChunk) {
        // Start TTS in parallel, don't await
        ttsQueue.push(processSpeechChunk(speechChunk));
      }
    }

    // Flush remaining text
    const finalChunk = chunker.flush();
    if (finalChunk) {
      ttsQueue.push(processSpeechChunk(finalChunk));
    }

    // Wait for all TTS to complete
    await Promise.all(ttsQueue);

    // Send final audio marker
    ws.send(JSON.stringify({
      type: "agent.audio_chunk",
      audio: "",
      chunk_index: audioChunkIndex,
      is_last: true,
    }));

    data.state = "IDLE";
    
    ws.send(JSON.stringify({
      type: "agent.done",
      latency: {
        retrieval_ms: retrievalMs,
        llm_first_token_ms: llmFirstTokenMs,
        llm_total_ms: Date.now() - llmStart,
        tts_first_chunk_ms: ttsFirstChunkMs || 0,
        total_ms: Date.now() - startTime,
      },
    }));

  } catch (error) {
    if ((error as Error).name === "AbortError") return;
    throw error;
  }
}
```

### Phase 2.5: Audio Playback in Frontend (2 hours)

```typescript
// apps/web/lib/audio-player.ts

/**
 * Handles gapless playback of streaming audio chunks.
 */
export class StreamingAudioPlayer {
  private audioContext: AudioContext | null = null;
  private scheduledEndTime = 0;
  private sources: AudioBufferSourceNode[] = [];
  private onPlaybackEnd?: () => void;
  private isPlaying = false;

  constructor() {
    if (typeof window !== "undefined") {
      this.audioContext = new AudioContext();
    }
  }

  async start() {
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
    this.scheduledEndTime = this.audioContext!.currentTime;
    this.isPlaying = true;
  }

  async addChunk(base64Audio: string) {
    if (!this.audioContext || !this.isPlaying) return;

    // Decode base64 to ArrayBuffer
    const binaryString = atob(base64Audio);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Decode audio
    const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);

    // Create source node
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Schedule playback (gapless)
    const startTime = Math.max(this.scheduledEndTime, this.audioContext.currentTime);
    source.start(startTime);
    
    this.scheduledEndTime = startTime + audioBuffer.duration;
    this.sources.push(source);

    // Cleanup when done
    source.onended = () => {
      const idx = this.sources.indexOf(source);
      if (idx !== -1) this.sources.splice(idx, 1);
    };
  }

  stop() {
    this.isPlaying = false;
    
    // Stop all scheduled audio immediately
    for (const source of this.sources) {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
    }
    this.sources = [];
    this.scheduledEndTime = 0;
  }

  onEnd(callback: () => void) {
    this.onPlaybackEnd = callback;
  }

  get playing() {
    return this.isPlaying && this.sources.length > 0;
  }
}
```

**Update the chat component:**

```tsx
// apps/web/app/page.tsx (voice additions)

import { StreamingAudioPlayer } from "@/lib/audio-player";

export default function Chat() {
  // ... existing state ...
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);

  useEffect(() => {
    audioPlayerRef.current = new StreamingAudioPlayer();
  }, []);

  useEffect(() => {
    const conn = new AgentConnection("ws://localhost:3002");
    connectionRef.current = conn;
    
    conn.subscribe(async (event) => {
      switch (event.type) {
        // ... existing cases ...

        case "agent.audio_chunk":
          if (event.is_last) {
            setIsSpeaking(false);
          } else {
            if (!isSpeaking) {
              await audioPlayerRef.current?.start();
              setIsSpeaking(true);
            }
            await audioPlayerRef.current?.addChunk(event.audio);
          }
          break;
      }
    });

    conn.connect();
    return () => conn.disconnect();
  }, []);

  const handleInterrupt = () => {
    audioPlayerRef.current?.stop();
    setIsSpeaking(false);
    connectionRef.current?.send({ type: "user.interrupt" });
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      {/* ... existing UI ... */}

      {/* Speaking indicator + stop button */}
      {isSpeaking && (
        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse delay-100" />
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse delay-200" />
          </div>
          <span className="text-sm text-gray-600">Speaking...</span>
          <button
            onClick={handleInterrupt}
            className="text-sm text-red-500 hover:text-red-700"
          >
            Stop
          </button>
        </div>
      )}

      {/* ... rest of UI ... */}
    </div>
  );
}
```

### Day 2 Checklist

- [ ] Voice recordings done (30+ minutes)
- [ ] Clips processed and transcribed
- [ ] Modal XTTS service deployed
- [ ] Voice profile created on Modal
- [ ] Text chunker working (start TTS before LLM finishes)
- [ ] Audio streaming to frontend
- [ ] Gapless playback working
- [ ] Interrupt stops audio immediately
- [ ] Latency HUD shows TTS timings

---

## Day 3: Voice Input + Polish

**Goal:** Full voice conversation loop with low latency.

### Phase 3.1: Deepgram STT Integration (2 hours)

```typescript
// apps/agent/src/services/stt.ts
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

export interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  confidence: number;
}

export class STTSession {
  private deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
  private connection: any = null;
  private onTranscript: (result: TranscriptionResult) => void;
  private onError: (error: Error) => void;
  private finalTranscript = "";

  constructor(
    onTranscript: (result: TranscriptionResult) => void,
    onError: (error: Error) => void
  ) {
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  async start() {
    this.connection = this.deepgram.listen.live({
      model: "nova-2",
      language: "en",
      smart_format: true,
      interim_results: true,
      utterance_end_ms: 1000,
      vad_events: true,
      encoding: "linear16",
      sample_rate: 16000,
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const transcript = data.channel.alternatives[0]?.transcript || "";
      
      if (transcript) {
        if (data.is_final) {
          this.finalTranscript += " " + transcript;
          this.onTranscript({
            text: this.finalTranscript.trim(),
            isFinal: true,
            confidence: data.channel.alternatives[0]?.confidence || 0,
          });
        } else {
          this.onTranscript({
            text: this.finalTranscript + " " + transcript,
            isFinal: false,
            confidence: data.channel.alternatives[0]?.confidence || 0,
          });
        }
      }
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      // User stopped speaking
      this.onTranscript({
        text: this.finalTranscript.trim(),
        isFinal: true,
        confidence: 1,
      });
    });

    this.connection.on(LiveTranscriptionEvents.Error, (error: any) => {
      this.onError(new Error(error.message));
    });

    return new Promise<void>((resolve) => {
      this.connection.on(LiveTranscriptionEvents.Open, resolve);
    });
  }

  send(audioChunk: Buffer) {
    if (this.connection?.getReadyState() === 1) {
      this.connection.send(audioChunk);
    }
  }

  async close() {
    const transcript = this.finalTranscript.trim();
    this.connection?.finish();
    this.finalTranscript = "";
    return transcript;
  }
}
```

**Update agent to handle voice input:**

```typescript
// apps/agent/src/connection.ts (voice input additions)

import { STTSession } from "./services/stt";

interface ConnectionData {
  state: State;
  abortController?: AbortController;
  sttSession?: STTSession;
}

export async function handleConnection(ws: any, rawMessage: string | Buffer) {
  const data = ws.data as ConnectionData;
  
  // Handle binary audio data
  if (rawMessage instanceof Buffer || rawMessage instanceof ArrayBuffer) {
    handleAudioChunk(ws, data, Buffer.from(rawMessage));
    return;
  }

  try {
    const message = JSON.parse(rawMessage.toString());
    const event = ClientEvent.parse(message);

    switch (event.type) {
      case "user.text":
        await handleUserText(ws, data, event.content);
        break;
      
      case "user.interrupt":
        handleInterrupt(ws, data);
        break;

      case "user.audio_chunk":
        const audioBuffer = Buffer.from(event.audio, "base64");
        handleAudioChunk(ws, data, audioBuffer);
        break;

      case "user.audio_end":
        await handleAudioEnd(ws, data);
        break;
    }
  } catch (error) {
    ws.send(JSON.stringify({
      type: "agent.error",
      error: String(error),
      recoverable: true,
    }));
  }
}

async function handleAudioChunk(ws: any, data: ConnectionData, audio: Buffer) {
  // Start STT session if needed
  if (!data.sttSession) {
    data.state = "LISTENING";
    
    data.sttSession = new STTSession(
      (result) => {
        ws.send(JSON.stringify({
          type: "agent.transcript",
          content: result.text,
          is_final: result.isFinal,
        }));
      },
      (error) => {
        ws.send(JSON.stringify({
          type: "agent.error",
          error: error.message,
          recoverable: true,
        }));
      }
    );

    await data.sttSession.start();
  }

  data.sttSession.send(audio);
}

async function handleAudioEnd(ws: any, data: ConnectionData) {
  if (!data.sttSession) return;

  const transcript = await data.sttSession.close();
  data.sttSession = undefined;

  if (transcript) {
    // Process like text input
    await handleUserText(ws, data, transcript);
  } else {
    data.state = "IDLE";
  }
}
```

### Phase 3.2: Microphone Capture in Frontend (1.5 hours)

```typescript
// apps/web/lib/audio-recorder.ts

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudioChunk: (chunk: ArrayBuffer) => void;

  constructor(onAudioChunk: (chunk: ArrayBuffer) => void) {
    this.onAudioChunk = onAudioChunk;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    const source = this.audioContext.createMediaStreamSource(this.stream);
    
    // Use ScriptProcessor for raw PCM (deprecated but works everywhere)
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Convert float32 to int16
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.onAudioChunk(pcm16.buffer);
    };

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop() {
    this.processor?.disconnect();
    this.audioContext?.close();
    this.stream?.getTracks().forEach((t) => t.stop());
    
    this.processor = null;
    this.audioContext = null;
    this.stream = null;
  }
}
```

**Add voice button to chat:**

```tsx
// apps/web/components/chat/voice-button.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { AudioRecorder } from "@/lib/audio-recorder";

interface VoiceButtonProps {
  onAudioChunk: (chunk: ArrayBuffer) => void;
  onStart: () => void;
  onEnd: () => void;
  disabled?: boolean;
}

export function VoiceButton({ onAudioChunk, onStart, onEnd, disabled }: VoiceButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const toggleRecording = async () => {
    if (isRecording) {
      recorderRef.current?.stop();
      recorderRef.current = null;
      setIsRecording(false);
      onEnd();
    } else {
      recorderRef.current = new AudioRecorder(onAudioChunk);
      await recorderRef.current.start();
      setIsRecording(true);
      onStart();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
    };
  }, []);

  return (
    <button
      onClick={toggleRecording}
      disabled={disabled}
      className={`p-3 rounded-full transition-colors ${
        isRecording
          ? "bg-red-500 hover:bg-red-600 text-white"
          : "bg-gray-200 hover:bg-gray-300 text-gray-700"
      } disabled:opacity-50`}
    >
      {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
    </button>
  );
}
```

**Update main chat to handle voice:**

```tsx
// apps/web/app/page.tsx (final version)
"use client";

import { useState, useEffect, useRef } from "react";
import { AgentConnection } from "@/lib/websocket";
import { StreamingAudioPlayer } from "@/lib/audio-player";
import { VoiceButton } from "@/components/chat/voice-button";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    chunk_id: string;
    filename: string;
    excerpt: string;
  }>;
}

interface Latency {
  stt_ms?: number;
  retrieval_ms: number;
  llm_first_token_ms: number;
  llm_total_ms: number;
  tts_first_chunk_ms?: number;
  total_ms: number;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [latency, setLatency] = useState<Latency | null>(null);
  const [sources, setSources] = useState<any[]>([]);
  
  const connectionRef = useRef<AgentConnection | null>(null);
  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const currentMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    audioPlayerRef.current = new StreamingAudioPlayer();
    
    const conn = new AgentConnection("ws://localhost:3002");
    connectionRef.current = conn;
    
    conn.subscribe(async (event) => {
      switch (event.type) {
        case "agent.thinking":
          setIsProcessing(true);
          setCurrentResponse("");
          currentMessageIdRef.current = crypto.randomUUID();
          break;

        case "agent.transcript":
          setInterimTranscript(event.content);
          if (event.is_final) {
            setMessages((prev) => [
              ...prev,
              { id: crypto.randomUUID(), role: "user", content: event.content },
            ]);
            setInterimTranscript("");
          }
          break;

        case "agent.token":
          setCurrentResponse(event.accumulated);
          break;

        case "agent.sources":
          setSources(event.sources);
          break;

        case "agent.audio_chunk":
          if (event.is_last) {
            setIsSpeaking(false);
          } else if (event.audio) {
            if (!isSpeaking) {
              await audioPlayerRef.current?.start();
              setIsSpeaking(true);
            }
            await audioPlayerRef.current?.addChunk(event.audio);
          }
          break;

        case "agent.done":
          if (currentMessageIdRef.current && currentResponse) {
            setMessages((prev) => [
              ...prev,
              {
                id: currentMessageIdRef.current!,
                role: "assistant",
                content: currentResponse,
                sources,
              },
            ]);
          }
          setCurrentResponse("");
          setIsProcessing(false);
          setLatency(event.latency);
          currentMessageIdRef.current = null;
          break;

        case "agent.error":
          console.error("Agent error:", event.error);
          setIsProcessing(false);
          break;
      }
    });

    conn.connect();
    return () => conn.disconnect();
  }, []);

  const sendMessage = () => {
    if (!input.trim() || isProcessing) return;

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: input },
    ]);

    connectionRef.current?.send({
      type: "user.text",
      content: input,
    });

    setInput("");
  };

  const handleAudioChunk = (chunk: ArrayBuffer) => {
    const base64 = btoa(
      String.fromCharCode(...new Uint8Array(chunk))
    );
    connectionRef.current?.send({
      type: "user.audio_chunk",
      audio: base64,
    });
  };

  const handleVoiceStart = () => {
    setIsRecording(true);
    // Interrupt if agent is speaking
    if (isSpeaking) {
      handleInterrupt();
    }
  };

  const handleVoiceEnd = () => {
    setIsRecording(false);
    connectionRef.current?.send({ type: "user.audio_end" });
  };

  const handleInterrupt = () => {
    audioPlayerRef.current?.stop();
    setIsSpeaking(false);
    connectionRef.current?.send({ type: "user.interrupt" });
  };

  return (
    <div className="flex flex-col h-screen max-w-3xl mx-auto p-4">
      {/* Debug HUD */}
      {latency && (
        <div className="text-xs text-gray-500 mb-4 font-mono bg-gray-100 p-2 rounded">
          {latency.stt_ms && <span className="mr-3">STT: {latency.stt_ms}ms</span>}
          <span className="mr-3">Retrieval: {latency.retrieval_ms}ms</span>
          <span className="mr-3">LLM TTFT: {latency.llm_first_token_ms}ms</span>
          {latency.tts_first_chunk_ms && (
            <span className="mr-3">TTS TTFC: {latency.tts_first_chunk_ms}ms</span>
          )}
          <span className="font-bold">Total: {latency.total_ms}ms</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-4 rounded-lg ${
              msg.role === "user"
                ? "bg-blue-100 ml-12"
                : "bg-gray-100 mr-12"
            }`}
          >
            <div>{msg.content}</div>
            {msg.sources && msg.sources.length > 0 && (
              <details className="mt-2 text-sm text-gray-600">
                <summary className="cursor-pointer">
                  {msg.sources.length} sources
                </summary>
                <ul className="mt-1 space-y-1">
                  {msg.sources.map((s) => (
                    <li key={s.chunk_id} className="bg-white p-2 rounded">
                      <strong>{s.filename}</strong>: {s.excerpt}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}

        {/* Interim transcript */}
        {interimTranscript && (
          <div className="p-4 rounded-lg bg-blue-50 ml-12 italic text-gray-600">
            {interimTranscript}
            <span className="animate-pulse">...</span>
          </div>
        )}

        {/* Streaming response */}
        {currentResponse && (
          <div className="p-4 rounded-lg bg-gray-100 mr-12">
            {currentResponse}
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>

      {/* Status indicators */}
      <div className="flex items-center gap-4 mb-4">
        {isRecording && (
          <div className="flex items-center gap-2 text-red-500">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm">Listening...</span>
          </div>
        )}
        {isSpeaking && (
          <div className="flex items-center gap-2 text-green-500">
            <div className="flex gap-1">
              <span className="w-2 h-4 bg-green-500 animate-[bounce_0.5s_ease-in-out_infinite]" />
              <span className="w-2 h-4 bg-green-500 animate-[bounce_0.5s_ease-in-out_infinite_0.1s]" />
              <span className="w-2 h-4 bg-green-500 animate-[bounce_0.5s_ease-in-out_infinite_0.2s]" />
            </div>
            <span className="text-sm">Speaking</span>
            <button
              onClick={handleInterrupt}
              className="text-sm text-red-500 hover:text-red-700 ml-2"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type or use voice..."
          className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={isProcessing || isRecording}
        />
        <VoiceButton
          onAudioChunk={handleAudioChunk}
          onStart={handleVoiceStart}
          onEnd={handleVoiceEnd}
          disabled={isProcessing}
        />
        <button
          onClick={sendMessage}
          disabled={isProcessing || isRecording || !input.trim()}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

### Phase 3.3: Barge-In Detection (1 hour)

Detect when user starts speaking while agent is talking:

```typescript
// apps/agent/src/services/barge-in.ts

/**
 * Detects if incoming audio contains speech (for barge-in).
 * Simple energy-based VAD.
 */
export function detectSpeech(pcm16: Int16Array, threshold = 500): boolean {
  // Calculate RMS energy
  let sum = 0;
  for (let i = 0; i < pcm16.length; i++) {
    sum += pcm16[i] * pcm16[i];
  }
  const rms = Math.sqrt(sum / pcm16.length);
  
  return rms > threshold;
}
```

**Update connection handler for barge-in:**

```typescript
// In handleAudioChunk:

async function handleAudioChunk(ws: any, data: ConnectionData, audio: Buffer) {
  // Check for barge-in (user speaking while agent is speaking)
  if (data.state === "SPEAKING") {
    const pcm16 = new Int16Array(audio.buffer);
    if (detectSpeech(pcm16)) {
      // User is trying to interrupt
      handleInterrupt(ws, data);
      // Continue to start new STT session below
    } else {
      // No speech detected, ignore
      return;
    }
  }

  // ... rest of existing code ...
}
```

### Phase 3.4: Document Upload UI (1 hour)

```tsx
// apps/web/app/docs/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Loader2, CheckCircle, XCircle } from "lucide-react";

interface Document {
  id: string;
  filename: string;
  status: "pending" | "processing" | "ready" | "error";
  chunk_count: number;
  created_at: string;
}

export default function DocsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchDocuments();
    // Poll for status updates
    const interval = setInterval(fetchDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchDocuments = async () => {
    const res = await fetch("http://localhost:3001/docs");
    const data = await res.json();
    setDocuments(data.documents);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true);
    
    for (const file of acceptedFiles) {
      const formData = new FormData();
      formData.append("file", file);
      
      await fetch("http://localhost:3001/docs/upload", {
        method: "POST",
        body: formData,
      });
    }
    
    setUploading(false);
    fetchDocuments();
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "application/pdf": [".pdf"],
    },
  });

  const statusIcon = (status: string) => {
    switch (status) {
      case "processing":
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "ready":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Loader2 className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Your Documents</h1>

      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 mb-8 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-500" />
        ) : (
          <>
            <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-600">
              {isDragActive
                ? "Drop files here..."
                : "Drag files here or click to upload"}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              Supports .txt, .md, .pdf
            </p>
          </>
        )}
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {documents.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-gray-400" />
              <div>
                <div className="font-medium">{doc.filename}</div>
                <div className="text-sm text-gray-500">
                  {doc.status === "ready"
                    ? `${doc.chunk_count} chunks`
                    : doc.status}
                </div>
              </div>
            </div>
            {statusIcon(doc.status)}
          </div>
        ))}

        {documents.length === 0 && (
          <p className="text-center text-gray-500 py-8">
            No documents yet. Upload some to get started!
          </p>
        )}
      </div>
    </div>
  );
}
```

### Phase 3.5: Final Polish (2 hours)

**1. Add navigation:**

```tsx
// apps/web/components/nav.tsx
import Link from "next/link";
import { MessageSquare, FileText } from "lucide-react";

export function Nav() {
  return (
    <nav className="border-b">
      <div className="max-w-3xl mx-auto px-4 py-3 flex gap-6">
        <Link href="/" className="flex items-center gap-2 hover:text-blue-500">
          <MessageSquare className="w-4 h-4" />
          Chat
        </Link>
        <Link href="/docs" className="flex items-center gap-2 hover:text-blue-500">
          <FileText className="w-4 h-4" />
          Documents
        </Link>
      </div>
    </nav>
  );
}
```

**2. Error boundaries and loading states:**

```tsx
// apps/web/components/error-boundary.tsx
"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg">
            <h2 className="font-bold">Something went wrong</h2>
            <p className="text-sm">{this.state.error?.message}</p>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

**3. Environment variables:**

```bash
# apps/api/.env
SUPABASE_URL=your_url
SUPABASE_SERVICE_KEY=your_key
OPENAI_API_KEY=your_key

# apps/agent/.env
SUPABASE_URL=your_url
SUPABASE_SERVICE_KEY=your_key
OPENAI_API_KEY=your_key
DEEPGRAM_API_KEY=your_key
MODAL_TTS_URL=https://your-modal-app--tts-service.modal.run
```

**4. Run scripts in package.json:**

```json
{
  "scripts": {
    "dev": "bun run --parallel dev:*",
    "dev:web": "cd apps/web && bun run dev",
    "dev:api": "cd apps/api && bun run --hot src/index.ts",
    "dev:agent": "cd apps/agent && bun run --hot src/index.ts"
  }
}
```

### Day 3 Checklist

- [ ] Deepgram STT streaming working
- [ ] Microphone capture in browser
- [ ] Voice button toggles recording
- [ ] Interim transcripts showing
- [ ] Full voice loop: speak → transcribe → RAG → LLM → TTS → playback
- [ ] Barge-in detection (interrupt agent by speaking)
- [ ] Document upload UI
- [ ] Navigation between pages
- [ ] Latency HUD showing all timings
- [ ] Error handling throughout

---

## Testing Checklist

Before you demo:

### Functional
- [ ] Upload a document → chunks appear
- [ ] Ask a question about the document → get grounded answer
- [ ] Sources accordion shows relevant excerpts
- [ ] Voice: tap mic → speak → see transcript → hear response
- [ ] Interrupt: start speaking while agent talks → stops immediately
- [ ] Text + voice work interchangeably

### Performance
- [ ] Time-to-first-audio < 2 seconds
- [ ] LLM first token < 500ms
- [ ] Audio playback is gapless
- [ ] No audio glitches on interrupt

### Edge Cases
- [ ] Empty query → handled gracefully
- [ ] No relevant docs → says so honestly
- [ ] Network disconnect → reconnects
- [ ] Long response → audio keeps streaming

---

## Rough Time Breakdown

| Phase | Hours |
|-------|-------|
| **Day 1** | |
| Project setup | 1 |
| Shared types | 0.5 |
| Supabase setup | 0.5 |
| Document upload API | 1.5 |
| Processing + embeddings | 2 |
| Agent WebSocket | 2 |
| Basic frontend | 2 |
| **Day 2** | |
| Voice recording | 1 |
| Modal XTTS service | 2 |
| Text chunking | 1 |
| TTS integration | 2 |
| Audio playback | 2 |
| **Day 3** | |
| Deepgram STT | 2 |
| Mic capture + UI | 1.5 |
| Barge-in | 1 |
| Docs UI | 1 |
| Polish + testing | 2 |

**Total: ~24 hours of focused work**

---

## What You'll Have

A working personal AI that:
- Knows everything in your documents
- Speaks in your voice
- Listens to you
- Can be interrupted naturally
- Shows you exactly where its knowledge comes from
- Has observable latency metrics

This is significantly more impressive than most "AI wrapper" demos because you built the hard parts: real-time voice, interruption handling, and grounded retrieval.

Good luck. Ship it.

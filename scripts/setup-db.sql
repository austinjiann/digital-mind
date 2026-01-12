-- Digital Mind: Supabase Database Schema
-- Run this in Supabase SQL editor

-- Enable pgvector extension
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

-- Vector similarity search function
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

-- Create storage bucket for documents
-- Note: Run this via Supabase dashboard or API
-- insert into storage.buckets (id, name, public) values ('documents', 'documents', false);

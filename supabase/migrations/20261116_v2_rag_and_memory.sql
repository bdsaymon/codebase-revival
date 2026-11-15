-- SMFTA AI Pro V2 RAG (pgvector) & Vector Memory Persistence Migration
CREATE EXTENSION IF NOT EXISTS vector;

-- V2 Knowledge Document Chunks with pgvector embeddings (768-dim)
CREATE TABLE IF NOT EXISTS public.smfta_v2_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  doc_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text DEFAULT 'text/plain',
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_smfta_v2_document_chunks_user_doc
  ON public.smfta_v2_document_chunks (user_id, doc_id, chunk_index);

-- V2 Persistent Memories with pgvector embeddings (768-dim)
CREATE TABLE IF NOT EXISTS public.smfta_v2_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  pinned boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_smfta_v2_memories_user
  ON public.smfta_v2_memories (user_id, updated_at DESC);

-- Enable Row Level Security
ALTER TABLE public.smfta_v2_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.smfta_v2_memories ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS Policies for V2 RAG Document Chunks
CREATE POLICY "Users can view their own V2 document chunks"
  ON public.smfta_v2_document_chunks
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can manage their own V2 document chunks"
  ON public.smfta_v2_document_chunks
  FOR ALL
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Owner-only RLS Policies for V2 Vector Memories
CREATE POLICY "Users can view their own V2 memories"
  ON public.smfta_v2_memories
  FOR SELECT
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role');

CREATE POLICY "Users can manage their own V2 memories"
  ON public.smfta_v2_memories
  FOR ALL
  USING (auth.uid()::text = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid()::text = user_id OR auth.role() = 'service_role');

-- Similarity search RPCs for V2 RAG and V2 Memory retrieval
CREATE OR REPLACE FUNCTION public.match_v2_document_chunks(
  query_embedding vector(768),
  match_user_id text,
  match_count integer DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  doc_id text,
  file_name text,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.doc_id,
    c.file_name,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.smfta_v2_document_chunks c
  WHERE c.user_id = match_user_id
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 25));
$$;

CREATE OR REPLACE FUNCTION public.match_v2_memories(
  query_embedding vector(768),
  match_user_id text,
  match_count integer DEFAULT 6
)
RETURNS TABLE (
  id uuid,
  content text,
  pinned boolean,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.content,
    m.pinned,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.smfta_v2_memories m
  WHERE m.user_id = match_user_id
    AND m.embedding IS NOT NULL
  ORDER BY m.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(match_count, 25));
$$;

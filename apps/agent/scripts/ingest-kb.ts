/**
 * Knowledge Base Ingestion Script
 *
 * Clears existing documents/chunks and ingests all .md files from kb/ folder
 *
 * Usage: bun run scripts/ingest-kb.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";
import { createHash } from "crypto";
import OpenAI from "openai";
import { encode } from "gpt-tokenizer";

// Initialize clients
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const openai = new OpenAI();

// Configuration
const KB_PATH = join(import.meta.dir, "../../../kb");
const MAX_TOKENS = 512;

interface ParsedFile {
  filename: string;
  relativePath: string;
  frontmatter: Record<string, any>;
  content: string;
}

interface Chunk {
  content: string;
  tokenCount: number;
}

// Parse YAML front matter from markdown
function parseFrontmatter(text: string): { frontmatter: Record<string, any>; content: string } {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (!match) {
    return { frontmatter: {}, content: text };
  }

  const yamlStr = match[1];
  const content = match[2];

  // Simple YAML parser for our use case
  const frontmatter: Record<string, any> = {};
  for (const line of yamlStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();

      // Handle arrays like [tag1, tag2]
      if (value.startsWith("[") && value.endsWith("]")) {
        frontmatter[key] = value.slice(1, -1).split(",").map(s => s.trim());
      } else {
        frontmatter[key] = value;
      }
    }
  }

  return { frontmatter, content };
}

// Recursively find all .md files
async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(fullPath));
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

// Chunk text into smaller pieces
function chunkText(text: string, maxTokens: number): Chunk[] {
  const chunks: Chunk[] = [];
  const paragraphs = text.split(/\n\n+/);

  let currentChunk = "";
  let currentTokens = 0;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    const paraTokens = encode(trimmedPara).length;

    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        tokenCount: currentTokens,
      });

      // Start new chunk with some overlap
      const words = currentChunk.split(" ");
      const overlapWords = words.slice(-Math.floor(words.length * 0.1));
      currentChunk = overlapWords.join(" ") + "\n\n" + trimmedPara;
      currentTokens = encode(currentChunk).length;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmedPara;
      currentTokens = encode(currentChunk).length;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      tokenCount: currentTokens,
    });
  }

  return chunks;
}

// Generate embeddings in batches
async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`  Embedding batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}...`);

    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch,
    });

    allEmbeddings.push(...response.data.map((d) => d.embedding));
  }

  return allEmbeddings;
}

async function main() {
  console.log("🗑️  Clearing existing data...");

  // Delete all chunks first (foreign key constraint)
  const { error: chunksError } = await supabase
    .from("chunks")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

  if (chunksError) {
    console.error("Error deleting chunks:", chunksError);
    process.exit(1);
  }

  // Delete all documents
  const { error: docsError } = await supabase
    .from("documents")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

  if (docsError) {
    console.error("Error deleting documents:", docsError);
    process.exit(1);
  }

  console.log("✅ Cleared existing data\n");

  // Find all markdown files
  console.log(`📁 Scanning ${KB_PATH} for markdown files...`);
  const mdFiles = await findMarkdownFiles(KB_PATH);
  console.log(`   Found ${mdFiles.length} files\n`);

  // Parse all files
  const parsedFiles: ParsedFile[] = [];
  for (const filePath of mdFiles) {
    const text = await readFile(filePath, "utf-8");
    const { frontmatter, content } = parseFrontmatter(text);
    const relativePath = relative(KB_PATH, filePath);
    const filename = relativePath.replace(/\//g, "_");

    parsedFiles.push({
      filename,
      relativePath,
      frontmatter,
      content,
    });
  }

  // Process each file
  let totalChunks = 0;

  for (const file of parsedFiles) {
    console.log(`📄 Processing ${file.relativePath}...`);

    // Create document record
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        filename: file.filename,
        storage_path: `kb/${file.relativePath}`,
        mime_type: "text/markdown",
        size_bytes: Buffer.byteLength(file.content, "utf-8"),
        status: "processing",
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error(`   Error creating document: ${docError?.message}`);
      continue;
    }

    // Chunk the content
    const chunks = chunkText(file.content, MAX_TOKENS);
    console.log(`   Created ${chunks.length} chunks`);

    if (chunks.length === 0) {
      await supabase
        .from("documents")
        .update({ status: "ready", chunk_count: 0 })
        .eq("id", doc.id);
      continue;
    }

    // Generate embeddings
    const embeddings = await embedTexts(chunks.map((c) => c.content));

    // Insert chunks
    const chunkRows = chunks.map((chunk, i) => ({
      document_id: doc.id,
      content: chunk.content,
      chunk_index: i,
      chunk_hash: createHash("sha256").update(chunk.content).digest("hex"),
      token_count: chunk.tokenCount,
      embedding: embeddings[i],
      metadata: {
        ...file.frontmatter,
        source_file: file.relativePath,
      },
    }));

    const { error: insertError } = await supabase.from("chunks").insert(chunkRows);

    if (insertError) {
      console.error(`   Error inserting chunks: ${insertError.message}`);
      await supabase
        .from("documents")
        .update({ status: "error", error_message: insertError.message })
        .eq("id", doc.id);
      continue;
    }

    // Update document status
    await supabase
      .from("documents")
      .update({ status: "ready", chunk_count: chunks.length })
      .eq("id", doc.id);

    totalChunks += chunks.length;
    console.log(`   ✅ Done\n`);
  }

  console.log("========================================");
  console.log(`✅ Ingestion complete!`);
  console.log(`   Documents: ${parsedFiles.length}`);
  console.log(`   Total chunks: ${totalChunks}`);
  console.log("========================================");
}

main().catch(console.error);

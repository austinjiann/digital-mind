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

    if (!doc) {
      throw new Error("Document not found");
    }

    // Download file
    const { data: fileData } = await supabase.storage
      .from("documents")
      .download(doc.storage_path);

    if (!fileData) {
      throw new Error("Failed to download file");
    }

    const text = await fileData.text();

    // Chunk the text
    const chunks = chunkText(text, {
      maxTokens: 512,
      overlap: 50,
    });

    if (chunks.length === 0) {
      await supabase
        .from("documents")
        .update({
          status: "ready",
          chunk_count: 0,
        })
        .eq("id", documentId);
      return;
    }

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

    const { error: insertError } = await supabase.from("chunks").insert(chunkRows);

    if (insertError) {
      throw insertError;
    }

    // Update document status
    await supabase
      .from("documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
      })
      .eq("id", documentId);

    console.log(`Processed document ${documentId}: ${chunks.length} chunks created`);
  } catch (error) {
    console.error("Processing error:", error);
    await supabase
      .from("documents")
      .update({
        status: "error",
        error_message: String(error),
      })
      .eq("id", documentId);
  }
}
